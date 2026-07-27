# Git Commit Commands for Benchmark Plan

Run these commands in PowerShell from the project root:

```powershell
cd "c:\Personal Projects\Salishforge\memforge\memforge"

# Stage all new and modified benchmark files
git add BENCHMARK_PLAN.md
git add BENCHMARK_IMPLEMENTATION.md
git add benchmarks/longmemeval-qa/
git add README.md
git add benchmarks/RESULTS.md
git add benchmarks/README.md
git add CHANGELOG.md
git add NEXTGEN-RECOMMENDATIONS.md
git add PHASE_5_PLAN.md
git add package.json

# Verify what's staged
git status

# Commit with descriptive message
git commit -m "feat: comprehensive benchmark plan + QA accuracy harness

- BENCHMARK_PLAN.md: Complete execution guide for AI agents
- benchmarks/longmemeval-qa/: Full QA accuracy harness (retrieve→generate→judge)
- benchmarks/README.md: Updated with QA accuracy section
- README.md: Relabelled badge to 'LongMemEval-S retrieval R@5'
- benchmarks/RESULTS.md: Added disclaimer distinguishing retrieval from QA accuracy
- CHANGELOG.md: Documented benchmark relabelling (WB-01 complete)
- NEXTGEN-RECOMMENDATIONS.md: Updated WB-01 status
- PHASE_5_PLAN.md: Updated benchmark references
- package.json: Added benchmark:longmemeval-qa script

Phase 1 (P0) credibility fixes complete. QA accuracy harness implemented
and ready for smoke testing. Supports both OpenAI GPT-4o and Ollama models."

# Push to master branch
git push origin master

# Or if using main branch
# git push origin main
```

## Alternative: Using GitHub Desktop

If you have GitHub Desktop installed:
1. Open GitHub Desktop
2. It should automatically detect the changed files
3. Write commit message (use the one above)
4. Click "Commit to master"
5. Click "Push origin"

## Files to Commit

### New files (6)
- `BENCHMARK_PLAN.md`
- `BENCHMARK_IMPLEMENTATION.md`
- `benchmarks/longmemeval-qa/evaluate.ts`
- `benchmarks/longmemeval-qa/run.ts`
- `benchmarks/longmemeval-qa/types.ts`
- `benchmarks/longmemeval-qa/ingest.ts`
- `benchmarks/longmemeval-qa/README.md`

### Modified files (7)
- `README.md`
- `benchmarks/RESULTS.md`
- `benchmarks/README.md`
- `CHANGELOG.md`
- `NEXTGEN-RECOMMENDATIONS.md`
- `PHASE_5_PLAN.md`
- `package.json`

## Verify After Commit

After pushing, verify on GitHub:
https://github.com/salishforge/memforge

Check that:
- [ ] All files appear in the commit history
- [ ] `BENCHMARK_PLAN.md` is viewable in the repo
- [ ] `benchmarks/longmemeval-qa/` directory exists with all files
- [ ] Commit message is properly formatted
