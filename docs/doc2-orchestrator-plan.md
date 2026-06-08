# Orchestrator Plan (Doc2) — Build the Fitness Tracker via Subagents

> **Audience:** the orchestrating agent (you). You coordinate; you do **not** write app code yourself.
> **Your two inputs:** this file (`doc2-orchestrator-plan.md`) and the big plan (`doc1-build-plan.md`).
> **Your job:** (1) split Doc1 into per-task files, (2) dispatch one task at a time to a fresh Claude Code subagent, (3) track progress, (4) stop when all 18 tasks are ✅ and acceptance passes.
>
> **Why two docs.** Doc1 is too large to fit in a small subagent's context. You never feed Doc1 to a builder whole. You split it once, then hand each subagent only `_common.md` + that subagent's single task file. This document is small on purpose so you can always hold it.

---

## 0. Mental model

```
        ┌─────────────────────────────────────────────┐
        │  ORCHESTRATOR (you)  — holds Doc2 + manifest │
        └───────────────┬─────────────────────────────┘
                        │ 1. split Doc1
                        ▼
        build-tasks/_common.md
        build-tasks/task-01..18-*.md
        build-tasks/manifest.json
                        │ 2. for each task in dependency order:
                        ▼
        ┌─────────────────────────────────────────────┐
        │  SUBAGENT (fresh context per task)           │
        │  gets: _common.md + task-NN-*.md             │
        │  does: writes files, runs Verification block │
        │  returns: PASS/FAIL + notes                  │
        └───────────────┬─────────────────────────────┘
                        │ 3. you update PROGRESS.md, commit, next task
                        ▼
                  …repeat 1 task at a time…
```

Key rule: **one task = one subagent = one fresh context.** Never let a subagent see more than `_common.md` + its own task file. That is the whole point of the split.

---

## 1. Step one — split Doc1

Create `split_plan.py` at the repo root with the exact contents in **Appendix S** of this document, then run:

```bash
python3 split_plan.py doc1-build-plan.md build-tasks
```

Expected output: `_common.md`, `task-01-scaffold.md` … `task-18-readme.md`, and `manifest.json`, all in `build-tasks/`. The script asserts the split is lossless (each task body is reproduced verbatim) and that every fence is balanced; if it raises an AssertionError, **stop** — Doc1's fences are malformed, fix them before continuing.

### What the splitter produces, and why each piece exists

- **`_common.md`** — shared data model, project facts, conventions. Every subagent reads this first. It is never edited by subagents.
- **`task-NN-<slug>.md`** — one self-contained task. Each begins with a machine-readable `<!-- build-task … -->` front-matter block (id, num, slug, deps, common) followed by a human "read _common first / depends on …" note, then the original task content (full code + Verification block) verbatim.
- **`manifest.json`** — your index. Maps each task id to its slug, dependency list, and filename. You drive the whole build loop off this file; you do not re-parse Doc1.

The fences in Doc1 look like:

```
<!-- @@BEGIN id="task-03" slug="streak" deps="2" -->
…task content…
<!-- @@END id="task-03" -->
```

and for shared context:

```
<!-- @@BEGIN id="common" -->
…sections 1–3…
<!-- @@END id="common" -->
```

The splitter keys on line-start `<!-- @@BEGIN`/`<!-- @@END` only, so the illustrative examples inside Doc1's blockquoted preamble (which start with `>`) are ignored.

---

## 2. Step two — create the tracker

Write `PROGRESS.md` at the repo root from the template in **Appendix T**. You can also generate its task rows directly from `manifest.json` so the dependency column is always accurate:

```bash
python3 - << 'PY'
import json
m = json.load(open('build-tasks/manifest.json'))
rows = []
for tid in sorted(m['tasks']):
    t = m['tasks'][tid]
    deps = ', '.join(str(d) for d in t['deps']) or '—'
    rows.append(f"| {t['num']} | {t['slug']} | `{t['file']}` | {deps} | ⬜ | ⬜ | |")
print('\n'.join(rows))
PY
```

Paste the rows under the table header in Appendix T. Statuses start ⬜.

---

## 3. Step three — the dispatch loop (Claude Code subagents)

You will use Claude Code's subagent mechanism (the `Task` tool / "dispatch a subagent" capability). Each subagent runs in its own context window, so it must be given everything it needs and nothing it doesn't.

### 3.1 Choosing the next task

A task is **eligible** when every id in its `deps` is marked ✅ in `PROGRESS.md`. Pick the lowest-numbered eligible task. (The task numbering is already a valid topological order, so "lowest eligible" always works; you may also run independent eligible tasks in parallel — see 3.4.)

Helper to print the next eligible task(s):

```bash
python3 - << 'PY'
import json, re
m = json.load(open('build-tasks/manifest.json'))
prog = open('PROGRESS.md').read()
done = set(int(n) for n in re.findall(r'\|\s*(\d+)\s*\|[^|]*\|[^|]*\|[^|]*\|\s*✅', prog))
elig = []
for tid in sorted(m['tasks']):
    t = m['tasks'][tid]
    if t['num'] in done: continue
    if all(d in done for d in t['deps']): elig.append((t['num'], t['file']))
print("done:", sorted(done))
print("eligible now:", elig)
PY
```

### 3.2 The exact subagent prompt (template)

Dispatch a subagent with a prompt assembled like this. Substitute `{N}`, `{FILE}`, and paste the **full text** of `_common.md` and the task file (do not summarize them):

```
You are a build subagent. You implement exactly ONE task of a larger app, then verify it.

Repository root: /Users/skpkuma/wd/discipline-page/
Do not read any other task files. Do not look ahead. Implement only what this task specifies.

=== SHARED CONTEXT (build-tasks/_common.md) ===
{paste the entire contents of build-tasks/_common.md}

=== YOUR TASK (build-tasks/{FILE}) ===
{paste the entire contents of build-tasks/{FILE}}

Instructions:
1. Create/modify exactly the files this task's "Produces" line lists, with the code given. Do not invent extra files.
2. Honor every shared convention in _common.md (module pattern, single setState write, relative .js imports, data model shape).
3. Run this task's Verification block. For browser-console checks, reason through them and report expected vs. any risk; for buildable checks, actually perform them.
4. Report back in this exact format:
   STATUS: PASS | FAIL
   FILES: <comma-separated paths you wrote>
   VERIFIED: <which verification steps you ran and their result>
   NOTES: <anything the orchestrator must know; blockers if FAIL>
Do not modify files outside this task's scope. If a dependency seems missing, STOP and report FAIL with NOTES — do not build it yourself.
```

### 3.3 After the subagent returns

- **PASS:** in `PROGRESS.md`, set that task's Status → ✅, fill "Files produced" and "Verified? ✅", then commit:
  ```bash
  git add -A && git commit -m "task {N}: {slug}"
  ```
- **FAIL:** set Status → ❌, write the blocker in Notes. Decide: fix Doc1's task text if the spec was wrong, or re-dispatch with a corrective note appended to the prompt. Never advance past a ❌ whose dependents need it.

Then return to 3.1 for the next eligible task.

### 3.4 Optional parallelism

Independent eligible tasks can run concurrently in separate subagents. From the dependency graph, safe early parallel sets include: after Task 1 → {2, 5} can run together; after 2 → {3, 7, 9} and after 5 → {6, 8}. **Never** parallelize a task with one of its own dependencies, and serialize anything that writes `style.css` if your subagents can't safely append concurrently (the CSS-appending tasks 5,6,10,11,12,13,14,15 all touch `style.css` — either serialize those or have each write a separate `styles/NN.css` and `@import` them, then merge in Task 16). Simplest safe default: **run strictly sequentially in task-number order.**

---

## 4. Step four — finish

When tasks 1–17 are ✅, dispatch Task 18 (README + Apps Script + the end-to-end sync test). Then run the **FINAL ACCEPTANCE** checklist that lives at the bottom of `doc1-build-plan.md` (it is outside the fences, so it stays in Doc1 as the canonical acceptance list). Mark the build complete only when all 14 criteria pass with zero console errors on desktop Chrome and iPhone Safari.

---

## 5. Guardrails (read once)

- **Context hygiene:** a subagent sees only `_common.md` + its task. If you ever feel tempted to paste Doc1 wholesale into a subagent, you've defeated the design.
- **Single source of truth for deps:** `manifest.json`, generated by the splitter from Doc1's fences. If you change a dependency, change it in Doc1's fence and re-split — don't hand-edit the manifest.
- **Idempotent splitting:** re-running `split_plan.py` overwrites `build-tasks/` deterministically. Safe to re-run after editing Doc1.
- **Commits are your save points:** one commit per ✅ task means you can always resume after an interruption by reading `PROGRESS.md` + `git log`.
- **Don't let subagents look ahead:** lookahead causes them to "helpfully" build future files inconsistently. The deps note in each task file tells them what they may assume already exists.

---

# Appendix S — `split_plan.py` (copy verbatim)

```python
#!/usr/bin/env python3
"""
split_plan.py — Carve Doc1 (doc1-build-plan.md) into per-task build files.

Reads fenced blocks delimited by line-start markers:

    <!-- @@BEGIN id="common" -->
    ...content...
    <!-- @@END id="common" -->

    <!-- @@BEGIN id="task-03" slug="streak" deps="2" -->
    ...content...
    <!-- @@END id="task-03" -->

Emits, into ./build-tasks/:
    _common.md                      (shared context: project facts, data model, conventions)
    task-NN-<slug>.md               (one per task; each prepends a reference to _common.md
                                     and a machine-readable front-matter block with deps)
    manifest.json                   (id -> {slug, deps, file}; consumed by the orchestrator)

Guarantees:
    * Every @@BEGIN has a matching @@END (asserted).
    * Output is deterministic and idempotent (safe to re-run).
    * The split is lossless for fenced content: each fenced block's bytes are
      reproduced verbatim inside its output file (asserted via round-trip check).

Usage:
    python3 split_plan.py doc1-build-plan.md          # -> ./build-tasks/
    python3 split_plan.py doc1-build-plan.md out_dir   # custom output dir
"""
import json
import os
import re
import sys

BEGIN_RE = re.compile(r'^<!--\s*@@BEGIN\s+(.*?)\s*-->\s*$')
END_RE   = re.compile(r'^<!--\s*@@END\s+(.*?)\s*-->\s*$')
ATTR_RE  = re.compile(r'(\w+)="([^"]*)"')


def parse_attrs(s):
    return dict(ATTR_RE.findall(s))


def parse_blocks(lines):
    """Return list of dicts: {id, attrs, content(list of lines)}. Asserts balanced fences."""
    blocks, i, n = [], 0, len(lines)
    while i < n:
        m = BEGIN_RE.match(lines[i])
        if not m:
            i += 1
            continue
        attrs = parse_attrs(m.group(1))
        bid = attrs.get('id')
        assert bid, f"@@BEGIN with no id at line {i+1}"
        # collect until matching END with same id
        content, j, closed = [], i + 1, False
        while j < n:
            em = END_RE.match(lines[j])
            if em:
                end_attrs = parse_attrs(em.group(1))
                assert end_attrs.get('id') == bid, (
                    f"@@END id mismatch at line {j+1}: expected {bid!r}, got {end_attrs.get('id')!r}")
                closed = True
                break
            # a stray BEGIN before our END means an unclosed block
            assert not BEGIN_RE.match(lines[j]), (
                f"nested/unclosed @@BEGIN inside {bid!r} at line {j+1}")
            content.append(lines[j])
            j += 1
        assert closed, f"unclosed @@BEGIN id={bid!r} starting at line {i+1}"
        blocks.append({'id': bid, 'attrs': attrs, 'content': content})
        i = j + 1
    return blocks


def deps_list(attrs):
    raw = attrs.get('deps', '').strip()
    return [int(x) for x in raw.split(',') if x.strip()] if raw else []


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'doc1-build-plan.md'
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'build-tasks'
    with open(src, encoding='utf-8') as f:
        lines = f.readlines()

    blocks = parse_blocks(lines)
    by_id = {b['id']: b for b in blocks}
    assert 'common' in by_id, "no @@BEGIN id=\"common\" block found"

    os.makedirs(out_dir, exist_ok=True)

    # --- _common.md ---
    common_body = ''.join(by_id['common']['content']).strip('\n') + '\n'
    common_path = os.path.join(out_dir, '_common.md')
    with open(common_path, 'w', encoding='utf-8') as f:
        f.write('# Shared Context (read before any task)\n\n')
        f.write('> Every task file references this. It is the authoritative data model, '
                'project facts, and conventions. Do not duplicate or fork it.\n\n')
        f.write(common_body)

    # --- task files + manifest ---
    manifest = {'common': '_common.md', 'tasks': {}}
    task_ids = sorted(b['id'] for b in blocks if b['id'].startswith('task-'))
    for tid in task_ids:
        b = by_id[tid]
        num = int(tid.split('-')[1])
        slug = b['attrs'].get('slug', f'task{num}')
        deps = deps_list(b['attrs'])
        fname = f'{tid}-{slug}.md'
        body = ''.join(b['content']).strip('\n') + '\n'

        with open(os.path.join(out_dir, fname), 'w', encoding='utf-8') as f:
            # machine-readable front matter for the subagent
            f.write('<!-- build-task\n')
            f.write(json.dumps({'id': tid, 'num': num, 'slug': slug,
                                'deps': deps, 'common': '_common.md'}, indent=2))
            f.write('\n-->\n\n')
            f.write(f'> **Before you start:** read `_common.md` in this folder. '
                    f'It is the shared data model and conventions for the whole app.\n')
            if deps:
                dep_files = ', '.join(f'`task-{d:02d}-*`' for d in deps)
                f.write(f'>\n> **Depends on (must already be ✅ in PROGRESS.md):** {dep_files}\n')
            else:
                f.write('>\n> **Depends on:** nothing — this is a root task.\n')
            f.write('\n')
            f.write(body)

        manifest['tasks'][tid] = {'num': num, 'slug': slug, 'deps': deps, 'file': fname}

    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    # --- round-trip assertion: every task body survives verbatim ---
    for tid in task_ids:
        b = by_id[tid]
        original = ''.join(b['content']).strip('\n')
        emitted = open(os.path.join(out_dir, manifest['tasks'][tid]['file']),
                       encoding='utf-8').read()
        assert original in emitted, f"LOSSY SPLIT: body of {tid} not found verbatim in output"

    print(f"OK: wrote _common.md + {len(task_ids)} task files + manifest.json -> {out_dir}/")
    for tid in task_ids:
        t = manifest['tasks'][tid]
        print(f"  {t['file']:<34} deps={t['deps']}")


if __name__ == '__main__':
    main()
```

---

# Appendix T — `PROGRESS.md` template

```markdown
# Build Progress Tracker

Project root: /Users/skpkuma/wd/discipline-page/
Doc1 (plan):  docs/doc1-build-plan.md
Doc2 (this):  docs/doc2-orchestrator-plan.md
Task files:   build-tasks/ (generated by split_plan.py)

## Status legend: ⬜ not started · 🟨 in progress · ✅ done · ❌ blocked

| # | Task | File | Depends on | Status | Verified? | Notes |
|---|------|------|------------|--------|-----------|-------|
<!-- paste rows generated from manifest.json here (see Doc2 §2) -->

## Global invariants (must hold after every task)
- Every state write goes through store.setState() (single atomic localStorage write).
- accomplishments.recalculate(state) runs before every setState that follows a log/commitment change.
- All module imports are relative with explicit .js extension.
- App loads with zero console errors on iPhone Safari and desktop Chrome.

## Build log
<!-- one line per completed task: "task N (slug): PASS — commit <sha>" -->
```

---

**End of orchestrator plan.** Split once (§1), track (§2), dispatch one task per subagent in dependency order (§3), accept (§4).
