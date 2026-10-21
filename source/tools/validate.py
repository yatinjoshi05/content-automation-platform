"""Static validator for n8n workflows.
Checks:
- JSON parse syntax
- Unique node names and IDs per workflow
- Connection graphs: valid source and target nodes, output branch bounds, no duplicate edges
- Expression brace balancing ({{ ... }})
- Webhook path uniqueness and webhookId presence
- No secret patterns (tokens, API keys, private keys)
- No embedded credentials
- Trigger presence and reachability (no orphaned nodes)
- (Optional, if n8n-nodes-base is found): node type registration, supported typeVersion, parameter definition checks
"""
import json, re, os, sys, glob

# Search for n8n-nodes-base package definition
PK_CANDIDATES = [
    os.environ.get('N8N_NODES_BASE_DIR', ''),
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'n8n-nodes-base')),
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'node_modules', 'n8n-nodes-base')),
    os.path.expandvars(r'%APPDATA%\npm\node_modules\n8n\node_modules\n8n-nodes-base'),
    '/tmp/nb/package'
]
PK = next((c for c in PK_CANDIDATES if c and os.path.isfile(os.path.join(c, 'package.json'))), None)

registry = {}
if PK:
    try:
        pk = json.load(open(os.path.join(PK, 'package.json'), encoding='utf8'))
        for p in pk.get('n8n', {}).get('nodes', []):
            registry[p.split('/')[-1].replace('.node.js', '').lower()] = p
        print(f"Loaded n8n-nodes-base schema from: {PK} ({len(registry)} node types)")
    except Exception as e:
        print(f"Warning: Failed reading {PK}: {e}")
else:
    print("Notice: n8n-nodes-base package not found on disk. Skipping deep property schema checks.")
    print("        All syntax, connections, graph reachability, secrets, brace balance, and triggers will be validated.")

def node_dir(t):
    if not PK or not registry:
        return (None, None)
    try:
        sub = t.split('.', 1)[1].lower()
    except IndexError:
        sub = t.lower()
    p = registry.get(sub)
    return (os.path.dirname(os.path.join(PK, p)), os.path.join(PK, p)) if p else (None, None)

_vc = {}
_pc = {}

def versions(entry, d):
    if d in _vc: return _vc[d]
    vs = set()
    files = [entry] + glob.glob(d + '/**/*.js', recursive=True)
    for f in files:
        try:
            s = open(f, encoding='utf8').read()
            for m in re.finditer(r"(?:version|defaultVersion): *(\[[^\]]*\]|[\d.]+)", s):
                vs |= {float(x) for x in re.findall(r"[\d.]+", m.group(1))}
            m = re.search(r"nodeVersions = \{([^}]*)\}", s, re.S)
            if m:
                vs |= {float(x) for x in re.findall(r"^\s*([\d.]+):", m.group(1), re.M)}
        except Exception:
            pass
    _vc[d] = vs
    return vs

def param_names(d):
    if d not in _pc:
        names = set()
        for f in glob.glob(d + '/**/*.js', recursive=True):
            try:
                names |= set(re.findall(r"name: '([\w.]+)'", open(f, encoding='utf8').read()))
            except Exception:
                pass
        _pc[d] = names
    return _pc[d]

def find_workflow_files():
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'workflows')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'workflows')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..')),
        os.path.abspath(os.path.join(os.getcwd(), 'workflows')),
        os.getcwd()
    ]
    for c in candidates:
        matches = sorted(glob.glob(os.path.join(c, '[0-9][0-9]_*.json')))
        if matches:
            return matches
    raise FileNotFoundError("Could not locate workflow files in candidate directories:\n  " + "\n  ".join(candidates))

SECRET = re.compile(r"(AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9]{20,}|ya29\.|gsk_[A-Za-z0-9]{20,}|xox[bp]-|-----BEGIN|Bearer [A-Za-z0-9._\-]{20,})")
errs = []
total = 0
paths = {}

workflow_files = find_workflow_files()
print(f"Validating {len(workflow_files)} workflow files...")

for f in workflow_files:
    fn = os.path.basename(f)
    try:
        w = json.load(open(f, encoding='utf8'))
    except Exception as e:
        errs.append(f'{fn}: JSON parse {e}')
        continue
    
    raw = open(f, encoding='utf8').read()
    if SECRET.search(raw):
        errs.append(f'{fn}: secret-like string')
    if ('JAR' + 'VIS') in raw.upper():
        errs.append(f'{fn}: forbidden project name')
        
    names = [n['name'] for n in w['nodes']]
    ids = [n['id'] for n in w['nodes']]
    if len(set(names)) != len(names):
        errs.append(f'{fn}: duplicate node names')
    if len(set(ids)) != len(ids):
        errs.append(f'{fn}: duplicate node ids')
        
    outs = {}
    for n in w['nodes']:
        total += 1
        if 'credentials' in n and n['credentials']:
            errs.append(f'{fn}:{n["name"]}: embeds credentials')
            
        t = n.get('type', '')
        if t == 'n8n-nodes-base.stickyNote':
            continue
            
        d, entry = node_dir(t)
        if d:
            vs = versions(entry, d)
            if float(n.get('typeVersion', 1)) not in vs:
                errs.append(f'{fn}:{n["name"]}: typeVersion {n.get("typeVersion")} not in {sorted(vs)} for {t}')
            pn = param_names(d) | ({'authentication'} if t.endswith('.webhook') else set())
            for k in n.get('parameters', {}).keys():
                if k not in pn:
                    errs.append(f'{fn}:{n["name"]}: param "{k}" not defined by {t}')
        elif registry:
            errs.append(f'{fn}:{n["name"]}: unknown node type {t}')
            
        # Expression brace check (always executed)
        def walk(o):
            if isinstance(o, dict):
                for x in o.values(): walk(x)
            elif isinstance(o, list):
                for x in o: walk(x)
            elif isinstance(o, str) and o.startswith('=') and o.count('{{') != o.count('}}'):
                errs.append(f'{fn}:{n["name"]}: unbalanced braces in expression "{o[:60]}"')
        walk(n.get('parameters', {}))
        
        # Webhook checks
        if t.endswith('.webhook'):
            p = n.get('parameters', {}).get('path')
            if p:
                if p in paths:
                    errs.append(f'{fn}: webhook path {p} duplicated (also in {paths[p]})')
                paths[p] = fn
            if not n.get('webhookId'):
                errs.append(f'{fn}:{n["name"]}: no webhookId')
                
        outs[n['name']] = 2 if (t.endswith('.if') or n.get('onError') == 'continueErrorOutput') else 1

    # Connections graph checks
    for src, c in w.get('connections', {}).items():
        if src not in names:
            errs.append(f'{fn}: connection from unknown node {src}')
            continue
        for i, br in enumerate(c.get('main', [])):
            if br and i >= outs.get(src, 1):
                errs.append(f'{fn}: {src} uses output {i}, node has {outs.get(src, 1)}')
            tg = [l['node'] for l in br]
            if len(tg) != len(set(tg)):
                errs.append(f'{fn}: {src} output {i} has DUPLICATE edge to the same node (node would run twice)')
            for l in br:
                if l['node'] not in names:
                    errs.append(f'{fn}: {src} -> unknown node {l["node"]}')
                    
    # Trigger reachability graph check
    trig = [n['name'] for n in w['nodes'] if re.search(r'(webhook|scheduleTrigger|errorTrigger)$', n.get('type', ''))]
    seen = set(trig)
    st = list(trig)
    while st:
        curr = st.pop()
        for br in w.get('connections', {}).get(curr, {}).get('main', []):
            for l in br:
                if l['node'] not in seen:
                    seen.add(l['node'])
                    st.append(l['node'])
                    
    orphan = [n for n in names if n not in seen and n != 'Read me']
    if orphan:
        errs.append(f'{fn}: unreachable nodes: {orphan}')
    if not trig:
        errs.append(f'{fn}: no trigger found')
        
    print(f'  {fn}: {len(names)} nodes')

print(f'\nValidated {len(workflow_files)} workflows, {total} total nodes, {len(paths)} unique webhook paths.')
if errs:
    print(f'FAIL: Found {len(errs)} error(s):')
    for e in errs:
        print(f' - {e}')
    sys.exit(1)
else:
    print('PASS: All structural, graph, syntax, secret, trigger, and reachability checks passed cleanly with 0 errors.')
    sys.exit(0)
