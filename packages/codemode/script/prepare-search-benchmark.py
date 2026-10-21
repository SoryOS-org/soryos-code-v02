import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

import pyarrow.parquet as parquet

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--partition", choices=["original", "review"], default="original")
arguments = parser.parse_args()
arguments.output.mkdir(parents=True, exist_ok=True)

tools_revision = "e06c38c75612b6536bd959e08cdd345894aba6a7"
queries_revision = "b8c76ad3349ff17497b6bdb28bb5b8f61a0f6445"
review_repeats = {
    "rotbench_query_19", "rotbench_query_398", "rotbench_query_140", "rotbench_query_321",
    "rotbench_query_266", "rotbench_query_163", "rotbench_query_257",
}
sources = [
    "apibank", "apigen", "autotools-food", "autotools-music", "autotools-weather",
    "mnms", "restgpt-spotify", "restgpt-tmdb", "reversechain", "rotbench",
    "t-eval-dialog", "t-eval-step", "taskbench-daily", "toolace", "toolbench",
    "toolemu", "tooleyes", "toollens", "ultratool",
]


def download(repository, revision, path):
    target = arguments.output / "raw" / repository / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with urlopen(f"https://huggingface.co/datasets/mangopy/{repository}/resolve/{revision}/{path}") as response:
            target.write_bytes(response.read())
    return parquet.read_table(target).to_pylist()


searches = {
    row["id"]: row["query"]
    for row in json.loads((Path(__file__).parent / "fixtures" / (
        "tool-search-review-queries.json" if arguments.partition == "review" else "tool-search-queries.json"
    )).read_text())
}
corpus = []
for row in download("ToolRet-Tools", tools_revision, "web/tools-00000-of-00001.parquet"):
    document = json.loads(row["documentation"])
    properties = {}
    if isinstance(document.get("parameters"), dict):
        for name, parameter in document["parameters"].items():
            properties[name] = {"type": "string"}
            if isinstance(parameter, dict) and isinstance(parameter.get("description"), str):
                properties[name]["description"] = parameter["description"]
    corpus.append({
        "id": row["id"],
        "path": row["id"] + "." + document["name"].replace(".", "_"),
        "description": document.get("description", ""),
        "properties": properties,
    })
queries = []
available = {row["id"] for row in corpus}
for source in sources:
    rows = download("ToolRet-Queries", queries_revision, source + "/queries-00000-of-00001.parquet")
    rows.sort(key=lambda row: hashlib.sha256(row["id"].encode()).hexdigest())
    split = "development" if int(hashlib.sha256(source.encode()).hexdigest(), 16) % 3 == 0 else "heldout"
    if arguments.partition == "review":
        split = "review-heldout"
    for row in rows[20:40] if arguments.partition == "review" else rows[:20]:
        relevant = [label["id"] for label in json.loads(row["labels"]) if label["relevance"] > 0]
        if not relevant or any(label not in available for label in relevant):
            raise ValueError(f"Missing positive tools for {row['id']}")
        queries.append({
            "id": row["id"], "query": row["query"], "search": searches[row["id"]],
            "source": source,
            "split": "review-repeat" if arguments.partition == "review" and row["id"] in review_repeats else split,
            "relevant": relevant,
        })
if len(queries) != len(searches):
    raise ValueError("Frozen query IDs do not match downloaded tasks")
output = arguments.output / "benchmark.json"
output.write_text(json.dumps({"corpus": corpus, "queries": queries}, ensure_ascii=False))
print(f"Prepared {len(corpus)} tools and {len(queries)} tasks: {output}")
