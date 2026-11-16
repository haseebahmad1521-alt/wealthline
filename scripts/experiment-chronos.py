"""Experiment, not used by the app: Chronos-2 (Amazon's open time-series foundation model) against the factor model on
the five past shocks. For each company and shock, Chronos-2 sees up to five years of the company's weekly log returns
before the shock, with global stocks, oil, Chinese stocks, the dollar and its sector fund as covariates, and is given
those covariates' actual moves during the shock as known future inputs: the same information the factor model gets.
Its forecast is the sum of its median weekly forecasts. Scored like the backtest (mean absolute miss, log points).

Setup (local only, git-ignored): python -m venv .venv-chronos, then pip install torch (CPU) and chronos-forecasting.
Run: node scripts/experiment-chronos-data.mjs, then .venv-chronos/Scripts/python scripts/experiment-chronos.py
"""
import json

import numpy as np
import pandas as pd
from chronos import Chronos2Pipeline

data = json.load(open('.venv-chronos/backtest-data.json', encoding='utf-8'))
pipe = Chronos2Pipeline.from_pretrained('amazon/chronos-2', device_map='cpu')
FACTORS = ['market', 'oil', 'china', 'usd']
CONTEXT = 260  # weeks

totals = {'naive': [], 'factor': [], 'chronos': [], 'chronos_no_cov': [], 'blend': []}
for ev in data['events']:
    weeks = ev['weeks']
    ctx_rows, fut_rows, plain_rows, ids = [], [], [], []
    for c in data['companies']:
        if c['id'] not in ev['base']:
            continue
        cov = {f: data['factors'][f] for f in FACTORS}
        if c['sector'] and c['sector'] in data['funds']:
            cov['sector'] = data['funds'][c['sector']]
        series = c['returns']
        # Weeks before the shock where the company and every covariate have a value, most recent CONTEXT of them.
        past = [w for w in sorted(series) if w < weeks[0] and all(w in v for v in cov.values())][-CONTEXT:]
        if len(past) < 104 or not all(all(w in v for v in cov.values()) for w in weeks):
            continue
        # Chronos needs a regular time index: number the weeks consecutively (the data are weekly already).
        stamps = pd.date_range('2000-01-02', periods=len(past) + len(weeks), freq='W')
        for i, w in enumerate(past):
            row = {'item_id': c['id'], 'timestamp': stamps[i], 'target': series[w]}
            row.update({k: v[w] for k, v in cov.items()})
            ctx_rows.append(row)
            plain_rows.append({'item_id': c['id'], 'timestamp': stamps[i], 'target': series[w]})
        for j, w in enumerate(weeks):
            row = {'item_id': c['id'], 'timestamp': stamps[len(past) + j]}
            row.update({k: v[w] for k, v in cov.items()})
            fut_rows.append(row)
        ids.append(c['id'])
    if not ids:
        continue
    ctx = pd.DataFrame(ctx_rows)
    fut = pd.DataFrame(fut_rows)
    # Companies without a sector fund lack that column: fill so the frames line up (0 = no move).
    ctx = ctx.fillna(0.0)
    fut = fut.fillna(0.0)
    with_cov = pipe.predict_df(ctx, future_df=fut, prediction_length=len(weeks), quantile_levels=[0.5])
    without = pipe.predict_df(pd.DataFrame(plain_rows), prediction_length=len(weeks), quantile_levels=[0.5])
    pred = with_cov.groupby('item_id')['predictions'].sum() if 'predictions' in with_cov else with_cov.groupby('item_id')['0.5'].sum()
    pred0 = without.groupby('item_id')['predictions'].sum() if 'predictions' in without else without.groupby('item_id')['0.5'].sum()
    errs = {k: [] for k in totals}
    for cid in ids:
        b = ev['base'][cid]
        errs['naive'].append(abs(b['naive'] - b['actual']))
        errs['factor'].append(abs(b['pred'] - b['actual']))
        errs['chronos'].append(abs(pred[cid] - b['actual']))
        errs['chronos_no_cov'].append(abs(pred0[cid] - b['actual']))
        errs['blend'].append(abs((pred[cid] + b['pred']) / 2 - b['actual']))
    print(f"{ev['label']:<32} n={len(ids):<3} " + '  '.join(f"{k} {np.mean(v) * 100:.1f}" for k, v in errs.items()), flush=True)
    for k, v in errs.items():
        totals[k].extend(v)
print('\nOVERALL (mean absolute miss, points)  ' + '  '.join(f"{k} {np.mean(v) * 100:.1f}" for k, v in totals.items()))
