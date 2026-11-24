"""Собирает каталог сайта из публичной папки Яндекс Диска.

Запуск:  python tools/build_catalog.py
Результат: data/catalog.json, data/search.json, data/s/<id>.json

Нужен только стандартный Python 3.10+, без сторонних пакетов.
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

PUBLIC_URL = "https://disk.yandex.ru/d/1IKFj00i6wnJog"
API = "https://cloud-api.yandex.net/v1/disk/public/resources"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

# Что не публикуем: чужой софт, книги, мусор.
SKIP_TOP = {"Программы"}
SKIP_EXT = {".exe", ".msi", ".dll", ".bat", ".cmd", ".iso", ".ithmb", ".bak", ".tmp",
            ".db", ".ini", ".lnk", ".djvu", ".torrent", ".apk", ".jar"}
SKIP_NAME = re.compile(r"^(~\$|\.|thumbs\.db$|desktop\.ini$)", re.I)

SECTION_NAMES = {"не сессия": "В семестре", "сессия": "Сессия", "дистант": "Дистант", "практика": "Практика"}

SUBJECTS = {
    "сопр": "Сопротивление материалов", "термех": "Теоретическая механика",
    "вм": "Высшая математика", "вышмат": "Высшая математика", "линал": "Линейная алгебра",
    "инфа": "Информатика", "информатика с-06,12": "Информатика", "начерт": "Начертательная геометрия",
    "инжграф": "Инженерная графика", "инжа": "Инженерная графика", "термод": "Техническая термодинамика",
    "элтех": "Электротехника", "детмаш": "Детали машин", "мжг": "Механика жидкости и газа",
    "мжг с-04": "Механика жидкости и газа (С-04)", "тмо": "Тепломассообмен",
    "ткм": "Технология конструкционных материалов", "ггд": "Гидрогазодинамика",
    "физгор": "Физика горения", "физика горения": "Физика горения", "гидра": "Гидродинамика ЭУ",
    "гдэу": "Гидродинамика ЭУ", "гидродинамика эу": "Гидродинамика ЭУ", "турбины с-02": "Турбины (С-02)",
    "бжд": "Безопасность жизнедеятельности", "отечественная история": "История России",
    "история": "История России", "втир лекции": "ВТИР", "физра": "Физкультура",
    "лекции философия": "Философия", "котлы с-04": "Котлы (С-04)",
    "авотматическое регулирование турбомашин": "Автоматическое регулирование турбомашин",
    "комбинированные установки": "Комбинированные установки", "лопастные машины": "Лопастные турбомашины",
    "восстановление деталей машин": "Восстановление деталей машин",
    "вдм (восстановление деталей машин)": "Восстановление деталей машин",
    "утс с-02 иг-03": "УТС", "утс с-10 с-11": "УТС",
}

DRAWING_EXT = {".dwg", ".dxf", ".cdw", ".frw", ".sldprt", ".sldasm", ".slddrw", ".m3d", ".a3d", ".spw"}


def classify(path, ext, section):
    s = path.lower()
    if re.search(r"лаб|\blab|\bлр\b", s):
        return "ЛР"
    if re.search(r"билет|экзам|зач[её]т", s):
        return "ЭКЗ"
    if re.search(r"курсов|курсач|\bкп\b|\bкр\.?\s?пр", s):
        return "КП"
    if re.search(r"лекци|конспект|шпор|методич", s):
        return "КОНС"
    if re.search(r"\b(дз|тр|ргр|ргз|бдз)\b|типов|домаш|расч[её]т", s):
        return "ТР"
    if re.search(r"\bкр\b|контрольн|\bкм\b", s):
        return "КР"
    if ext in DRAWING_EXT or re.search(r"черт[её]ж", s):
        return "ЧЕРТ"
    if section == "Сессия":
        return "ЭКЗ"
    return "ПРОЧЕЕ"


def api_list(path):
    items, off = [], 0
    while True:
        q = urllib.parse.urlencode({
            "public_key": PUBLIC_URL, "path": path, "limit": 1000, "offset": off,
            "fields": "_embedded.total,_embedded.items.name,_embedded.items.type,"
                      "_embedded.items.size,_embedded.items.path,_embedded.items.modified",
        })
        for attempt in range(6):
            try:
                with urllib.request.urlopen(f"{API}?{q}", timeout=60) as r:
                    d = json.load(r)["_embedded"]
                break
            except Exception:
                if attempt == 5:
                    raise
                time.sleep(2 + attempt * 3)
        items += d["items"]
        off += 1000
        if off >= d["total"]:
            return items


def crawl():
    files, todo = [], ["/"]
    with ThreadPoolExecutor(4) as ex:
        while todo:
            batch, todo = todo, []
            for items in ex.map(api_list, batch):
                for it in items:
                    if it["type"] == "dir":
                        if not (it["path"].count("/") == 1 and it["name"] in SKIP_TOP):
                            todo.append(it["path"])
                    else:
                        files.append(it)
            print(f"  папок в очереди: {len(todo)}, файлов: {len(files)}", file=sys.stderr)
    return files


def subject_title(raw):
    t = SUBJECTS.get(raw.strip().lower())
    return t or raw.strip()[:1].upper() + raw.strip()[1:]


def slug(i):
    return f"s{i:03d}"


def main():
    cache = os.path.join(OUT, ".raw.json")
    if "--cached" in sys.argv and os.path.exists(cache):
        files = json.load(open(cache, encoding="utf-8"))
    else:
        print("Обхожу Яндекс Диск…", file=sys.stderr)
        files = crawl()
        os.makedirs(OUT, exist_ok=True)
        json.dump(files, open(cache, "w", encoding="utf-8"), ensure_ascii=False)

    groups = defaultdict(list)  # (sem, title, kind) -> files
    skipped = 0
    for f in files:
        parts = f["path"].strip("/").split("/")
        name = parts[-1]
        ext = os.path.splitext(name)[1].lower()
        if parts[0] in SKIP_TOP or ext in SKIP_EXT or SKIP_NAME.search(name) or len(parts) < 2:
            skipped += 1
            continue
        m = re.match(r"Семестр\s+(\d+)$", parts[0].strip())
        if m and len(parts) >= 4:
            sem = int(m.group(1))
            section = SECTION_NAMES.get(parts[1].strip().lower(), parts[1].strip())
            raw = parts[2]
            inner = parts[3:]
            key = (sem, subject_title(raw), "sem")
        elif m:
            sem, section, raw, inner = int(m.group(1)), "Разное", parts[1], parts[2:] or [name]
            key = (sem, "Разное", "sem")
        else:
            sem, section, raw, inner = None, parts[1] if len(parts) > 2 else "", parts[0], parts[1:]
            key = (None, parts[0], "collection")
        groups[key].append({
            "n": name,
            "p": f["path"],
            "d": "/".join(inner[:-1]),
            "sec": section,
            "s": f.get("size", 0),
            "t": classify("/".join(parts[1:]), ext, section),
            "m": (f.get("modified") or "")[:10],
        })

    order = sorted(groups, key=lambda k: (k[0] is None, k[0] or 0, -len(groups[k])))
    subjects, search = [], []
    os.makedirs(os.path.join(OUT, "s"), exist_ok=True)
    for old in os.listdir(os.path.join(OUT, "s")):
        os.remove(os.path.join(OUT, "s", old))
    for i, key in enumerate(order):
        sem, title, kind = key
        items = sorted(groups[key], key=lambda x: (x["sec"], x["d"], x["n"]))
        sid = slug(i)
        types = defaultdict(int)
        for it in items:
            types[it["t"]] += 1
        sections = sorted({it["sec"] for it in items if it["sec"]})
        # папка на Диске — общий префикс путей
        common = os.path.commonpath([it["p"] for it in items]) if len(items) > 1 else os.path.dirname(items[0]["p"])
        subjects.append({
            "id": sid, "sem": sem, "title": title, "kind": kind,
            "files": len(items), "size": sum(it["s"] for it in items),
            "types": dict(sorted(types.items(), key=lambda t: -t[1])),
            "sections": sections, "folder": common.replace("\\", "/"),
        })
        json.dump([[it["n"], it["p"], it["d"], it["sec"], it["s"], it["t"]] for it in items],
                  open(os.path.join(OUT, "s", f"{sid}.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        search += [[it["n"], sid, it["p"], it["t"]] for it in items]

    total_types = defaultdict(int)
    for s in subjects:
        for t, n in s["types"].items():
            total_types[t] += n
    catalog = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": PUBLIC_URL,
        "totals": {
            "files": sum(s["files"] for s in subjects),
            "size": sum(s["size"] for s in subjects),
            "subjects": len({(s["title"]) for s in subjects if s["kind"] == "sem"}),
            "semesters": len({s["sem"] for s in subjects if s["sem"]}),
            "types": dict(sorted(total_types.items(), key=lambda t: -t[1])),
        },
        "subjects": subjects,
    }
    json.dump(catalog, open(os.path.join(OUT, "catalog.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump(search, open(os.path.join(OUT, "search.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    t = catalog["totals"]
    print(f"Готово: {t['files']} файлов, {math.ceil(t['size'] / 2**30)} ГБ, "
          f"{len(subjects)} разделов, пропущено {skipped}", file=sys.stderr)


if __name__ == "__main__":
    main()
