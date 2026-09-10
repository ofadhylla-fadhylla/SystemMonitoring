# V8.13 Premium Travel Cost-Driver Detection

Enhancement to Penawaran Harga AI Recommendation.

Detects premium/specific travel requirements in existing free-text fields, including examples such as:
- Garuda / business class / premium economy / full-service airline
- Hotel minimum 4-star or 5-star
- Branded/international-chain hotel or single occupancy
- Dedicated/private ground transport

Behavior:
- Flags these as potential cost drivers.
- If travel cost is already quantified/included, the insight says the impact is reflected in all-in cost.
- If travel cost is missing/excluded/reimbursement while premium requirements exist, the system flags hidden-cost risk and applies a small uncertainty penalty to the decision-support score.
- Recommends asking the vendor for an all-in or rupiah value so comparisons remain apple-to-apple.

No SQL/database migration is required.
