import QtQuick
import qs.Ui

BarWidget {
    id: root
    moduleName: "jeremy.signboard"
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: "\uf0ae"
        tooltipText: "Signboard · personal sprint board"
        onPressed: function(mouseButton) {
            if (root.bar && mouseButton === Qt.LeftButton)
                root.bar.run("omarchy-shell shell toggle jeremy.signboard '{}'")
        }
    }
}
