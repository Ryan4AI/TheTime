#!/usr/bin/env python3
"""
Import Xia data package into cloud database.
Usage: python3 scripts/import-data.py data/xia-package.json
"""
import json, sys, subprocess, os

ENV = 'cloud1-d5gkbowyvbd1c85e1'

TABLE_MAP = {
    'era_meta': 'era_meta',
    'era_cities': 'era_cities', 
    'era_age_dist': 'era_age_dist',
    'social_structure': 'social_structure',
    'event': 'event'
}

def insert_records(table_name, records):
    """Insert records into a collection via tcb CLI."""
    if not records:
        print(f"  ⏭️  {table_name}: empty, skipped")
        return
    
    # Build MongoDB insert documents
    docs = []
    for rec in records:
        # Strip null values to keep db clean
        doc = {k: v for k, v in rec.items() if v is not None}
        docs.append(doc)
    
    cmd = json.dumps([{
        "TableName": table_name,
        "CommandType": "INSERT",
        "Command": json.dumps({
            "insert": table_name,
            "documents": docs
        }, ensure_ascii=False)
    }], ensure_ascii=False)
    
    result = subprocess.run(
        ['tcb', 'db', 'nosql', 'execute', '--command', cmd],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60
    )
    
    out = result.stdout.decode('utf-8', errors='replace')
    err = result.stderr.decode('utf-8', errors='replace')
    if result.returncode == 0:
        print(f"  ✅ {table_name}: {len(docs)} records inserted")
        if 'error' in out.lower() or 'fail' in out.lower():
            print(f"     ⚠️  may have errors: {out[:300]}")
    else:
        print(f"  ❌ {table_name} FAILED: {err[:300]}")
    
    return result

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/import-data.py <package.json>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    with open(filepath, 'r', encoding='utf-8') as f:
        pkg = json.load(f)
    
    total = 0
    for key in ['era_meta', 'era_cities', 'era_age_dist', 'social_structure', 'event']:
        t = TABLE_MAP.get(key)
        data = pkg.get(key, [])
        if not isinstance(data, list):
            data = [data]  # wrap single object
        insert_records(t, data)
        total += len(data)
    
    print(f"\n📊 合计: {total} 条记录写入云数据库 {ENV}")

if __name__ == '__main__':
    main()
