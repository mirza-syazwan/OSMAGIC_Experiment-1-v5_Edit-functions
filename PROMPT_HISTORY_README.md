# Prompt History Tracking System

This system automatically tracks the last 10 prompts and their code changes, allowing you to revert to any previous state.

## How It Works

1. **Before each prompt**: The system saves a snapshot of all tracked files
2. **After changes are made**: The system saves the new state
3. **To revert**: Use the command below to restore files to before a specific prompt

## Tracked Files

The following files are automatically tracked:
- `app.js`
- `index.html`
- `server.py`
- `styles.css`
- `storage.js`
- `task-manager.js`
- `task-manager.html`
- `task-manager.css`

## Usage

### View Prompt History

```bash
python prompt_tracker.py list
```

This shows the last 10 prompts with:
- Prompt number
- Timestamp
- Prompt text (first 100 characters)

### Revert to Before a Prompt

```bash
python prompt_tracker.py revert <prompt_number>
```

For example:
```bash
python prompt_tracker.py revert 3
```

This will restore all tracked files to their state **before** prompt #3 was executed.

## How the AI Assistant Uses This

When you give me a prompt, I will:
1. Automatically save the "before" snapshot with your prompt text
2. Make the requested changes
3. Save the "after" snapshot

You can then revert at any time using the commands above.

## Example Workflow

1. You: "Add a new button to the preview page"
   - I save snapshot (Prompt #1 - before)
   - I make changes
   - I save snapshot (Prompt #1 - after)

2. You: "Change the button color to red"
   - I save snapshot (Prompt #2 - before)
   - I make changes
   - I save snapshot (Prompt #2 - after)

3. You: "Revert to before prompt #2"
   - System restores files to state before "Change the button color to red"
   - All changes from prompt #2 are undone

## Notes

- Only the last 10 prompts are kept (oldest are automatically removed)
- The history is stored in `prompt_history.json`
- File snapshots are stored as full file contents (not diffs)

