# dsh-session-manager

A **Delete session** action for the DeepSeek Harness Web/Desktop client.

The Harness ships archive only: archiving hides a Session and keeps every byte.
This plugin adds the missing half. Deleting a Session moves its whole durable log
directory into a trash folder and archives it in the same gesture, so the row
leaves the Sidebar and the disk is reclaimed. The trash keeps the delete
reversible for a retention window before the sweep purges it.

## Install

In the DeepSeek Harness Desktop Plugin Manager choose **Add plugin** and enter:

\`\`\`
github:EmmanuelMartinez/dsh-session-manager#v1.0.0
\`\`\`

Then restart the application. Plugins do not auto-update: uninstall and
reinstall to move versions.

## Configuration

The bundle's \`cordis.patch.yml\` inserts the row with two settings:

- \`retentionDays\` (default 30): how long a trashed Session stays recoverable.
- \`sweepMinutes\` (default 60): how often the trash is purged; 0 purges only
  when a delete runs.

\`sessionsRoot\` and \`trashDir\` default to \`<dshHome>/sessions\` and
\`<dshHome>/trash/sessions\`; set them when a deployment keeps its logs
elsewhere.

## What it does not do

It never edits a Session log: the durable log is append-only and the delete
relocates a whole directory. Archived Sessions, pins, and the Session order are
untouched apart from the archive write the delete performs so the row leaves the
default list.
