## ADDED Requirements

### Requirement: Media assets expose playable source duration
The system SHALL persist the playable source duration for uploaded video and audio assets and return it to the client as `durationSeconds`.

#### Scenario: Uploading a long video stores duration metadata
- **WHEN** a user uploads a video asset whose playable length is longer than the default clip preset
- **THEN** the created asset record includes a positive `durationSeconds` value matching the probed source duration

#### Scenario: Uploading an audio clip stores duration metadata
- **WHEN** a user uploads an audio asset
- **THEN** the created asset record includes a positive `durationSeconds` value matching the probed source duration

### Requirement: New timeline clips use source duration as resize ceiling
The system SHALL create video and audio timeline clips with `baseDuration` equal to the asset's playable source duration, while the initial visible clip length MUST remain the smaller of the default preset and the source duration.

#### Scenario: Long video clip starts short but can grow
- **WHEN** a user adds a 45-second video asset to the timeline
- **THEN** the created clip starts with the default visible duration
- **AND** the clip's `baseDuration` is 45 seconds

#### Scenario: Short audio clip uses its full source duration
- **WHEN** a user adds a 3-second audio asset to the timeline
- **THEN** the created clip starts with a 3-second visible duration
- **AND** the clip's `baseDuration` is 3 seconds

### Requirement: Clip resize interactions allow extension and shrink within source bounds
The system SHALL allow users to shrink and extend a timeline clip from either edge as long as the resulting trim window stays within `0 <= trimStart < trimEnd <= baseDuration`.

#### Scenario: Extending the right edge after shrinking
- **WHEN** a user shortens a clip and then drags the right resize handle to the right
- **THEN** the system increases `trimEnd` until the pointer stops or `trimEnd` reaches `baseDuration`

#### Scenario: Extending the left edge restores earlier source media
- **WHEN** a user drags the left resize handle to the left on a previously shortened clip
- **THEN** the system decreases `trimStart`
- **AND** the system decreases `offsetSeconds` by the same amount
- **AND** the system stops at `trimStart = 0`

#### Scenario: Inspector sliders respect the same extension bounds
- **WHEN** a user adjusts clip trim values from the inspector panel
- **THEN** the input controls allow values up to the clip's `baseDuration`
- **AND** the saved clip matches the same bounds used by timeline dragging

### Requirement: Expanded clip duration survives save, reload, and export
The system SHALL preserve an expanded clip's trim range when the project is saved, reloaded, and converted into export commands.

#### Scenario: Expanded clip survives project reload
- **WHEN** a user extends a clip beyond the default preset and the project auto-saves
- **THEN** reloading the project restores the same `trimStart`, `trimEnd`, and `baseDuration`

#### Scenario: Export plan uses expanded duration
- **WHEN** a project contains a clip that was extended beyond the default preset
- **THEN** the export plan uses `-ss trimStart`
- **AND** the export plan uses `-t trimEnd - trimStart` with the expanded duration
