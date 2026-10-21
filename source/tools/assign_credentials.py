"""Optional convenience: injects YOUR credential ids/names into copies of the workflows (written to ../dist/) so you don't have to
pick a credential in ~200 nodes by hand. The repo JSON stays credential-free. Usage:
  python3 assign_credentials.py creds.json
creds.json (ids come from n8n: Credentials -> open one -> the id is in the URL):
  {"postgres":{"id":"..","name":"CA Postgres"}, "internal":{"id":"..","name":"CA Internal Key"}, "youtube_key":{...}, "youtube_oauth":{...},
   "gmail":{...}, "gemini":{...}, "groq":{...}, "meta":{...}}      (omit any you don't use; unmapped nodes keep no credential)"""
import json, sys, glob, os
m = json.load(open(sys.argv[1])); here = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(here, '..', 'dist'); os.makedirs(out, exist_ok=True)
def pick(n):
    t, p, name = n['type'], n['parameters'], n['name']
    if t.endswith('.postgres'): return 'postgres', 'postgres'
    if t.endswith('.webhook') and p.get('authentication') == 'headerAuth': return 'httpHeaderAuth', 'internal'
    if t.endswith('.youTube'): return 'youTubeOAuth2Api', 'youtube_oauth'
    if t.endswith('.gmail'): return 'gmailOAuth2', 'gmail'
    if t.endswith('.httpRequest'):
        a = p.get('genericAuthType')
        if name in ('Dispatch Worker', 'QA Worker'): return 'httpHeaderAuth', 'internal'
        if name == 'Gemini': return 'httpHeaderAuth', 'gemini'
        if a == 'httpBearerAuth': return 'httpBearerAuth', 'groq'
        if a == 'httpQueryAuth': return 'httpQueryAuth', ('meta' if name.startswith('IG ') else 'youtube_key')
    return None
candidates = [
    os.path.abspath(os.path.join(here, '..', '..', 'workflows')),
    os.path.abspath(os.path.join(here, '..', 'workflows')),
    os.path.abspath(os.path.join(here, '..'))
]
wf_dir = next((c for c in candidates if glob.glob(os.path.join(c, '[0-9][0-9]_*.json'))), here)
for f in sorted(glob.glob(os.path.join(wf_dir, '[0-9][0-9]_*.json'))):
    w = json.load(open(f))
    for n in w['nodes']:
        r = pick(n)
        if r and r[1] in m: n['credentials'] = {r[0]: m[r[1]]}; n_set += 1
    json.dump(w, open(os.path.join(out, os.path.basename(f)), 'w'), indent=2)
print(f'wrote dist/ with {n_set} credential references')
