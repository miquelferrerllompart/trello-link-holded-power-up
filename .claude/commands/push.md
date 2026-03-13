# Push Changes

Stage all changes, commit with a descriptive message, and push to the current branch.

## Instructions

1. **Stage all changes**: Run `git add -A` to stage all modified, added, and deleted files.

2. **Generate commit message**: Analyze the staged changes using `git diff --cached` and create a commit message following conventional commits format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `refactor:` for code refactoring
   - `test:` for adding/updating tests
   - `chore:` for maintenance tasks
   - `docs:` for documentation changes
   
   Keep the message concise but descriptive. Include scope if changes are localized (e.g., `fix(auth): ...`).

3. **Update docs if needed**: Before committing, check if the changes warrant updates to:
   - `CLAUDE.md` — if architecture, styles, partials, snippets, or conventions changed
   - `README.md` — if project-level docs need updating
   - Memory files — if something learned should persist across conversations

   Only update these if actually needed, not on every push.

4. **Commit the changes**: Run `git commit -m "<message>"`.

5. **Push to current branch**: Run `git push origin HEAD`.

6. **Handle failures**: If the push fails due to pre-push hooks (lint or test errors):
   - Read the error output carefully
   - Fix the lint errors or failing tests
   - Stage the fixes with `git add -A`
   - Amend the commit with `git commit --amend --no-edit`
   - Retry the push
   - Repeat until successful

7. **Report success**: Once pushed successfully, report the commit hash and branch name.

## Important

- Never force push unless explicitly requested
- If there are no changes to commit, inform the user
- If the branch has no upstream, use `git push -u origin HEAD`
