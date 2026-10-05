# Golar LNG: where should FLNG #4 go?

A business development case on Golar LNG's fourth floating LNG unit, ordered in August 2026 for delivery at the end of 2029 without a charter in place.

- `case/index.html` is the write up, with a charter economics calculator and a weighted screen of six possible deployments.
- `model/flng_model.py` holds every number and score. Running it prints the results and writes `case/data.js`, which the page reads.

```bash
python3 model/flng_model.py
python3 -m http.server 4174 -d case
```

Figures come from Golar's Q2 2026 interim results and public sources listed on the page. Screen scores are my own judgement. Not investment advice, and not affiliated with Golar LNG.
