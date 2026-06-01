import subprocess, json, os

os.chdir("/home/admin/workspace/TheTime")

env_id = "cloud1-d5gkbowyvbd1c85e1"
cols = ["era_meta", "era_cities", "era_age_dist", "social_structure", "event"]

for col in cols:
    cmd = [
        "tcb", "db", "nosql", "execute",
        "--env-id", env_id,
        "--command", json.dumps([{
            "TableName": col,
            "CommandType": "COMMAND",
            "Command": json.dumps({"count": col})
        }]),
        "--json"
    ]
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    r.stdout = r.stdout.decode('utf-8')
    r.stderr = r.stderr.decode('utf-8')
    try:
        d = json.loads(r.stdout)
        n = d["data"]["results"][0][0]["n"]
        # handle both $numberInt and $numberDouble formats
        if isinstance(n, dict):
            n = list(n.values())[0]
        print(f"{col}: {int(float(n))} records")
    except Exception as e:
        print(f"{col}: ERROR - {e}")
        print(r.stdout[:500] if r.stdout else r.stderr[:500])
