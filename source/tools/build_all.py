"""Regenerates every workflow JSON in ../ . Usage: python3 build_all.py"""
import json, os
from wf import auto_fail_code, finish_api
import build_part1 as p1, build_part2 as p2, build_part3 as p3
def get_out_dir():
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'workflows')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'workflows')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    ]
    for c in candidates:
        if os.path.isdir(c) and (os.path.basename(c) == 'workflows' or os.path.exists(os.path.join(c, '01_master_orchestrator.json'))):
            return c
    return candidates[0]
OUT = get_out_dir()
os.makedirs(OUT, exist_ok=True)
API_MAP = {'04': [('API Source Review', 'Validate Review Input', 'Apply Review')], '05': [('API Policy Review', 'Validate Review Input', 'Apply Policy Review')],
  '08': [('API Approval Action', 'Validate API Input', 'Apply Action (versioned)')], '09': [('API Reschedule', 'Validate API Input', 'Reschedule'), ('API Publication Reconcile', 'Validate Reconcile Input', 'Reconcile Publication')],
  '11': [('API Record Earning', 'Validate API Input', 'Insert Earning')]}
plan = [('01_master_orchestrator.json', p1.w01), ('02_trend_research.json', p1.w02), ('03_source_discovery.json', p1.w03),
        ('04_rights_verification.json', p1.w04), ('05_monetization_policy.json', p1.w05), ('06_clipping.json', p2.w06),
        ('07_content_packaging.json', p2.w07), ('08_approval.json', p2.w08), ('09_scheduler.json', p2.w09), ('10_publishing.json', p2.w10),
        ('11_analytics.json', p2.w11), ('12_supervisor.json', p2.w12), ('13_error_handler.json', p2.w13), ('14_notifications.json', p2.w14), ('15_visual_qa.json', p3.w15)]
for fn, f in plan:
    w = f()
    if fn.startswith('04'): p1.w04b(w)
    if fn.startswith('05'): p3.w05_api(w)
    if fn.startswith('09'): p3.w09_api(w)
    for wh, va, db in API_MAP.get(fn[:2], []): finish_api(w, wh, va, db)
    auto_fail_code(w)
    json.dump(w.export(), open(os.path.join(OUT, fn), 'w'), indent=2, ensure_ascii=False)
    print('wrote', fn, len(w.nodes), 'nodes')
