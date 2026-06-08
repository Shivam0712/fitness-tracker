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
