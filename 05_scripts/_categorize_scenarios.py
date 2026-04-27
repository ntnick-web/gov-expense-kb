"""Add `expense` field to each scenario in scenarios.json.

Maps each scenario to an EXPENSE_LAYER category by manual table.
Re-runnable: overwrites existing `expense` field.
"""

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path("C:/Users/user/OneDrive/桌面/支出規定視覺化資料庫")
SCENARIOS_PATH = ROOT / "04_web/data/scenarios.json"

# Manual mapping: scenario id → expense category (must match EXPENSE_LAYER in app.js)
EXPENSE_MAP = {
    # ── 國內旅費 ──
    "day-trip": "交通費",
    "premium-class": "交通費",
    "self-drive": "交通費",
    "necessary-distance": "交通費",
    "discount-ticket": "交通費",
    "change-transport": "交通費",
    "taxi": "交通費",
    "advance-postpone": "交通費",
    "holiday-via-office": "交通費",
    "station-choice": "交通費",
    "holiday-temporary": "交通費",
    "senior-premium": "交通費",
    "transport-substitute": "交通費",
    "car-rental": "交通費",
    "period-pass": "交通費",
    "overnight": "住宿費",
    "lodging-distance-60km": "住宿費",
    "lodging-weekday-holiday": "住宿費",
    "lodging-long-discount": "住宿費",
    "incidental": "雜費",
    "from-home": "通則與其他",
    "package-tour": "通則與其他",
    "training": "通則與其他",
    # ── 國外旅費 ──
    "abroad-basic": "通則與其他",
    "abroad-airfare": "交通費",
    "abroad-airfare-receipts": "交通費",
    "boarding-pass-lost": "交通費",
    "low-cost-carrier": "交通費",
    "abroad-taxi-classification": "禮品交際及雜費",  # 計程車 → 雜費
    "abroad-living": "生活費",
    "return-day-living-30": "生活費",
    "onboard-overnight-living": "生活費",
    "abroad-lodging-over-cap": "生活費",
    "abroad-insurance": "保險費",
    "passport-photo-fee": "手續費",
    "passport-rush-fee": "手續費",
    "registration-credit-card": "手續費",
    "credit-card-fee-cap": "手續費",
    "abroad-meeting": "行政費",
    "abroad-china": "大陸港澳",
    "abroad-incidental-receipts": "禮品交際及雜費",
    "abroad-incident": "通則與其他",
    "exchange-rate-no-receipt": "通則與其他",
    "foreign-receipt-translate": "通則與其他",
    "foreign-receipt-payee": "通則與其他",
    "international-date-line": "通則與其他",
    "illness-delay-return": "通則與其他",
    # ── 支出憑證與結報 ──
    "voucher-types": "通則與其他",
    "voucher-receipt": "收據與發票",
    "voucher-electronic": "收據與發票",
    "voucher-receipts": "收據與發票",
    "voucher-procurement": "採購結報",
    "procurement-detail": "採購結報",
    "voucher-misc": "採購結報",
    "personal-credit-card-payment": "採購結報",
    "voucher-payment": "酬勞與會議",
    "meeting-meals": "酬勞與會議",
    "voucher-shared": "補助與分攤",
    "voucher-grants": "補助與分攤",
    "voucher-lost": "系統化結報",
    "voucher-foreign": "通則與其他",
    "voucher-welfare": "通則與其他",
    "year-end-closing": "通則與其他",
    "credit-card-rewards-discount": "通則與其他",
    "invoice-tax-id-missing": "收據與發票",
    "invoice-payee-wrong": "收據與發票",
    "agency-abbreviation": "收據與發票",
    "e-invoice-tax-id-missing": "收據與發票",
    "foreign-receipt-no-payee": "收據與發票",
    "item-name-code-only": "收據與發票",
    "amount-correction": "收據與發票",
    "receipt-no-quantity": "收據與發票",
    "e-invoice-no-stamp": "收據與發票",
    "online-tx-no-receipt": "收據與發票",
    "stamp-tax-missing": "收據與發票",
    "handwritten-correction": "收據與發票",
}


def main() -> None:
    with open(SCENARIOS_PATH, encoding="utf-8") as f:
        data = json.load(f)

    sc = data["scenarios"]

    # Stats
    by_cat: dict[str, int] = {}
    missing: list[str] = []
    for s in sc:
        sid = s["id"]
        if sid not in EXPENSE_MAP:
            missing.append(sid)
            continue
        s["expense"] = EXPENSE_MAP[sid]
        by_cat[s["expense"]] = by_cat.get(s["expense"], 0) + 1

    if missing:
        print(f"⚠ Missing categorization for {len(missing)} scenarios:")
        for sid in missing:
            print(f"  - {sid}")
        sys.exit(1)

    print(f"✓ Categorized {len(sc)} scenarios:")
    for cat, n in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat:20s} {n}")

    # Re-order each scenario dict to put expense after parent for readability
    for s in sc:
        if "expense" in s:
            new_s = {}
            for k, v in s.items():
                new_s[k] = v
                if k == "parent":
                    new_s["expense"] = s["expense"]
            # Remove the trailing one we duplicated
            if "expense" in new_s and list(new_s).count("expense") > 1:
                # Already ordered correctly via dict insertion; nothing to do
                pass
            s.clear()
            for k, v in new_s.items():
                if k != "expense" or "expense" not in s:
                    s[k] = v

    with open(SCENARIOS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Saved {SCENARIOS_PATH}")


if __name__ == "__main__":
    main()
