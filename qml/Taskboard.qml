import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons

Item {
    id: root
    property var shell: null
    property var manifest: null
    property bool opened: false
    property string boardPath: ""
    property string selection: "current"
    property string selectedId: ""
    property string errorMessage: ""
    property string agentMessage: ""
    property var data: ({ rows: [], columns: ["To do", "Doing", "Waiting", "Done"], sprints: [], totals: {} })
    readonly property string cli: decodeURIComponent(Qt.resolvedUrl("../bin/signboard.js").toString().replace(/^file:\/\//, ""))
    readonly property var choices: [{ label: "Current sprint", value: "current" }, { label: "Backlog", value: "backlog" }, { label: "All work", value: "all" }].concat(data.sprints.map(s => ({ label: s.name + " · " + s.status, value: s.id })))
    readonly property var selected: findItem(selectedId)
    readonly property color fg: Color.foreground
    readonly property color bg: Color.background
    readonly property color muted: Color.muted
    readonly property color accent: Color.accent
    readonly property color line: Qt.alpha(fg, 0.15)

    function findItem(id) {
        for (let row of data.rows) {
            if (row.story.id && row.story.id === id) return row.story
            for (let task of row.tasks) if (task.id === id) return task
        }
        return null
    }
    function args(command) {
        let result = ["node", cli].concat(command)
        if (boardPath) result = result.concat(["--board", boardPath])
        return result
    }
    function open(payloadJson) {
        try { let p = JSON.parse(payloadJson || "{}"); if (p.board) boardPath = p.board } catch (e) { errorMessage = String(e) }
        opened = true
        window.visible = true
        refresh()
    }
    function close() { opened = false; window.visible = false; watcher.running = false }
    function dismiss() { if (shell) shell.hide("jeremy.signboard"); else close() }
    function refresh() {
        watcher.running = false
        errorMessage = ""
        watcher.command = args(["taskboard", "--sprint", selection, "--watch", "--json"])
        watcher.running = true
    }
    function askAgent() {
        if (!prompt.text.trim() || launcher.running) return
        let command = ["agent", "--prompt", prompt.text, "--sprint", selection]
        if (selectedId) command = command.concat(["--card", selectedId])
        launcher.command = args(command)
        agentMessage = "Opening your default agent…"
        launcher.running = true
    }
    function moveTask(status) {
        if (!selected || mutation.running) return
        mutation.command = args(["work", "edit", selectedId, "--status", status, "--json"])
        mutation.running = true
    }

    Process {
        id: watcher
        stdout: SplitParser {
            onRead: line => {
                try { root.data = JSON.parse(line); root.errorMessage = "" } catch (e) { root.errorMessage = "Could not read the board: " + e }
            }
        }
        stderr: SplitParser { onRead: line => root.errorMessage = line }
    }
    Process {
        id: launcher
        stderr: SplitParser { onRead: line => root.agentMessage = line }
        onExited: (code, status) => {
            if (code === 0) { root.agentMessage = "Agent launched in Omarchy’s terminal. Board changes appear here automatically."; prompt.clear() }
            else root.agentMessage = "Agent could not launch (" + code + "). " + root.agentMessage
        }
    }
    Process {
        id: mutation
        stderr: SplitParser { onRead: line => root.errorMessage = line }
        onExited: (code, status) => { if (code === 0) root.refresh() }
    }

    component BoardButton: Button {
        id: button
        palette.buttonText: root.fg
        background: Rectangle {
            radius: 6
            color: button.down ? Qt.alpha(root.accent, 0.25) : button.hovered ? Qt.alpha(root.fg, 0.10) : Qt.alpha(root.fg, 0.05)
            border.color: button.activeFocus ? root.accent : root.line
        }
    }

    component TaskTile: Rectangle {
        id: tile
        required property var task
        width: parent.width
        implicitHeight: titleText.implicitHeight + metaText.implicitHeight + 30
        color: root.selectedId === task.id ? Qt.alpha(root.accent, 0.16) : Qt.alpha(root.fg, 0.05)
        radius: 6
        border.color: root.selectedId === task.id ? root.accent : root.line
        Column {
            anchors.fill: parent
            anchors.margins: 10
            spacing: 8
            Text { id: titleText; width: parent.width; text: tile.task.title; color: root.fg; wrapMode: Text.Wrap; font.pixelSize: 14 }
            Text {
                id: metaText
                width: parent.width
                text: (tile.task.estimate === null ? "Unestimated" : tile.task.estimate + "h") + (tile.task.blocked ? "  ·  Blocked" : "")
                color: tile.task.blocked ? Color.urgent : root.muted
                font.pixelSize: 12
                wrapMode: Text.Wrap
            }
        }
        MouseArea { anchors.fill: parent; onClicked: root.selectedId = tile.task.id }
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: task.title + ", " + task.status
        Keys.onReturnPressed: root.selectedId = task.id
        Keys.onSpacePressed: root.selectedId = task.id
        Rectangle { anchors.fill: parent; color: "transparent"; border.color: root.accent; radius: 6; visible: tile.activeFocus }
    }

    FloatingWindow {
        id: window
        visible: false
        title: "Signboard — personal sprint board"
        color: root.bg
        implicitWidth: 1440
        implicitHeight: 900
        minimumSize: Qt.size(900, 600)
        onVisibleChanged: { if (!visible && root.opened) root.dismiss() }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 14
            RowLayout {
                Layout.fillWidth: true
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: root.data.name || "Signboard"; color: root.fg; font.pixelSize: 24; font.bold: true }
                    Text { text: root.data.sprint ? root.data.sprint.goal || "Set a goal for this sprint" : "Capture work, split it into tasks, and choose what to take on."; color: root.muted; elide: Text.ElideRight; Layout.fillWidth: true }
                }
                ComboBox {
                    id: sprintPicker
                    model: root.choices
                    textRole: "label"
                    Layout.preferredWidth: 220
                    onActivated: index => { root.selection = root.choices[index].value; root.selectedId = ""; root.refresh() }
                }
                BoardButton { text: "Refresh"; onClicked: root.refresh() }
                BoardButton { text: "Close"; onClicked: root.dismiss() }
            }
            RowLayout {
                spacing: 24
                Text { text: (root.data.totals.done || 0) + " / " + (root.data.totals.tasks || 0) + " tasks done"; color: root.fg }
                Text {
                    text: (root.data.totals.doing || 0) + " doing" + (root.data.totals.wipLimit ? " / " + root.data.totals.wipLimit + " WIP limit" : "")
                    color: root.data.totals.wipLimit && root.data.totals.doing > root.data.totals.wipLimit ? Color.urgent : root.fg
                }
                Text {
                    text: (root.data.totals.estimatedHours || 0) + "h planned" + (root.data.totals.capacityHours !== null && root.data.totals.capacityHours !== undefined ? " / " + root.data.totals.capacityHours + "h capacity" : "")
                    color: root.data.totals.capacityHours !== null && root.data.totals.estimatedHours > root.data.totals.capacityHours ? Color.urgent : root.fg
                }
                Text { text: (root.data.totals.unestimated || 0) + " unestimated"; color: root.muted }
                Item { Layout.fillWidth: true }
            }
            Text { visible: !!root.errorMessage; text: root.errorMessage; color: Color.urgent; wrapMode: Text.Wrap; Layout.fillWidth: true }

            RowLayout {
                Layout.fillHeight: true
                Layout.fillWidth: true
                spacing: 16
                ScrollView {
                    id: boardScroll
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    contentWidth: Math.max(850, availableWidth)
                    contentHeight: boardRows.implicitHeight
                    Column {
                        id: boardRows
                        width: boardScroll.contentWidth
                        spacing: 12
                        Row {
                            width: parent.width
                            spacing: 8
                            Text { width: 180; text: "WORK ITEM"; color: root.muted; font.pixelSize: 12; height: 30 }
                            Repeater {
                                model: root.data.columns
                                Text { required property string modelData; width: (boardRows.width - 188) / root.data.columns.length - 8; text: modelData.toUpperCase(); color: root.muted; font.pixelSize: 12; height: 30 }
                            }
                        }
                        Repeater {
                            model: root.data.rows
                            Rectangle {
                                id: swimlane
                                required property var modelData
                                width: boardRows.width
                                height: Math.max(130, cells.implicitHeight + 20)
                                color: Qt.alpha(root.fg, 0.025)
                                border.color: root.line
                                radius: 8
                                Row {
                                    id: cells
                                    width: parent.width - 16
                                    x: 8; y: 10
                                    spacing: 8
                                    Column {
                                        width: 172
                                        spacing: 10
                                        Text { width: parent.width; text: swimlane.modelData.story.title; color: root.fg; wrapMode: Text.Wrap; font.pixelSize: 15; font.bold: true }
                                        Text { text: swimlane.modelData.tasks.filter(t => t.status === "Done").length + " / " + swimlane.modelData.tasks.length + " complete"; color: root.muted; font.pixelSize: 12 }
                                        BoardButton { visible: !!swimlane.modelData.story.id; text: "View / prompt"; onClicked: root.selectedId = swimlane.modelData.story.id }
                                    }
                                    Repeater {
                                        model: root.data.columns
                                        Column {
                                            id: statusCell
                                            required property string modelData
                                            width: (boardRows.width - 188) / root.data.columns.length - 8
                                            spacing: 8
                                            Repeater {
                                                model: swimlane.modelData.tasks.filter(t => t.status === statusCell.modelData)
                                                TaskTile { required property var modelData; task: modelData }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Text {
                            visible: root.data.rows.length === 0
                            width: parent.width
                            padding: 32
                            text: "This view has no work yet. Ask your agent to capture a work item and break it into tasks."
                            color: root.muted
                            wrapMode: Text.Wrap
                        }
                    }
                }

                Rectangle {
                    Layout.preferredWidth: 310
                    Layout.fillHeight: true
                    color: Qt.alpha(root.fg, 0.035)
                    border.color: root.line
                    radius: 8
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 14
                        spacing: 12
                        Text { text: root.selected ? root.selected.title : "Board assistant"; color: root.fg; wrapMode: Text.Wrap; Layout.fillWidth: true; font.bold: true; font.pixelSize: 18 }
                        Text { text: root.selected ? root.selected.id + " · " + root.selected.kind : "Prompt your default Omarchy agent to organise your work."; color: root.muted; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        ComboBox {
                            visible: !!root.selected && root.selected.kind === "task"
                            model: ["To do", "Doing", "Waiting", "Done"]
                            currentIndex: root.selected ? model.indexOf(root.selected.status) : 0
                            onActivated: index => root.moveTask(model[index])
                            enabled: !mutation.running
                            Layout.fillWidth: true
                        }
                        ScrollView {
                            visible: !!root.selected
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            TextArea { text: root.selected ? root.selected.body : ""; readOnly: true; wrapMode: TextEdit.Wrap; color: root.fg; background: null; selectByMouse: true }
                        }
                        Item { visible: !root.selected; Layout.fillHeight: true }
                        BoardButton { visible: !!root.selected; text: "Clear selection"; onClicked: root.selectedId = "" }
                        TextArea {
                            id: prompt
                            Layout.fillWidth: true
                            Layout.preferredHeight: 130
                            placeholderText: root.selected ? "Split this into smaller tasks…" : "Plan my next sprint…"
                            wrapMode: TextEdit.Wrap
                            color: root.fg
                            placeholderTextColor: root.muted
                            selectByMouse: true
                            background: Rectangle { color: root.bg; radius: 6; border.color: prompt.activeFocus ? root.accent : root.line }
                            Keys.onPressed: event => { if ((event.modifiers & Qt.ControlModifier) && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter)) { root.askAgent(); event.accepted = true } }
                        }
                        BoardButton { text: launcher.running ? "Launching…" : "Ask agent  Ctrl+Enter"; enabled: !!prompt.text.trim() && !launcher.running; Layout.fillWidth: true; onClicked: root.askAgent() }
                        Text { text: root.agentMessage; visible: !!text; color: root.muted; wrapMode: Text.Wrap; Layout.fillWidth: true; font.pixelSize: 12 }
                    }
                }
            }
        }
        Shortcut { sequence: "Escape"; onActivated: root.dismiss() }
    }
}
