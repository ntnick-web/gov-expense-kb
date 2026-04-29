"""_fix_flow_redundancy.py — Phase B #2:修 flow Q1=Q3 重疊問題。

主要修補:self-drive flow — 原本 Q1 問車輛、Q3 又問「車輛種類(再次確認)?」
拆 necessary 節點為 necessary_car / necessary_scooter,讓 Q1 直接路由到對應的
「必要路程」分支,省掉 Q3 重複問題。

順便:把「自用或租賃汽車」和「共享汽車」合併為「汽車(自用/租賃/共享)」
       因為兩個結論都是「每公里 3 元」,選項應合併避免使用者疑惑。
"""
import json, sys
try: sys.stdout.reconfigure(encoding="utf-8")
except: pass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCN = ROOT / "04_web/data/scenarios_manual.json"


def fix_self_drive(flow: dict) -> bool:
    if flow.get("start") != "vehicle":
        return False
    qs = flow["questions"]
    if "rate" not in qs:
        return False  # 已修過

    # 1. 重寫 vehicle Q:合併 汽車選項,直接路由到 necessary_car / necessary_scooter
    qs["vehicle"]["options"] = [
        {"label": "汽車(自用 / 租賃 / 共享)", "next": "necessary_car"},
        {"label": "機車", "next": "necessary_scooter"},
        {"label": "自行車", "conclude": "bike"},
    ]

    # 2. 拆 necessary 為兩個節點,直接 conclude
    qs["necessary_car"] = {
        "label": "是否符合「必要路程」(機關核處公里數)?",
        "hint": "汽車交通費依公里數覈計,須有機關事先核處之必要路程。",
        "options": [
            {"label": "是,有機關核處公里數", "conclude": "car"},
            {"label": "否,自由路徑或無核處依據", "conclude": "no_necessary"},
        ],
    }
    qs["necessary_scooter"] = {
        "label": "是否符合「必要路程」(機關核處公里數)?",
        "hint": "機車交通費依公里數覈計,須有機關事先核處之必要路程。",
        "options": [
            {"label": "是,有機關核處公里數", "conclude": "scooter"},
            {"label": "否,自由路徑或無核處依據", "conclude": "no_necessary"},
        ],
    }

    # 3. 移除舊的 necessary 與 rate 節點
    del qs["necessary"]
    del qs["rate"]

    return True


def main():
    data = json.loads(SCN.read_text(encoding="utf-8"))
    fixed = 0
    for s in data["scenarios"]:
        f = s.get("flow")
        if not f:
            continue
        if s["id"] == "self-drive":
            if fix_self_drive(f):
                fixed += 1
                print(f"✓ {s['id']}: 修 vehicle/necessary/rate Q1=Q3 重疊,移除「再次確認」步驟")

    if fixed:
        SCN.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n寫入 {SCN}({fixed} 個 flow 修補)")
    else:
        print("無變動")


if __name__ == "__main__":
    main()
