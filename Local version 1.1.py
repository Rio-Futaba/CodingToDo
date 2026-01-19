import sys
import json
import webbrowser
import math
from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QComboBox, QMessageBox, QTableWidget, QTableWidgetItem, QListWidget, QDialog,
    QDialogButtonBox, QRadioButton, QButtonGroup
)
from PyQt6.QtCore import Qt

PROBLEM_FILE = "problems.json"
DEFAULT_PROBLEM_TYPES = [
    "math", "ad hoc", "string algorithms", "greedy algorithms",
    "data structures", "dynamic programming", "graph theory"
]

STATUS_EMOJIS = {
    "unsolved": "❌",
    "solving": "🔄",
    "solved": "✅",
    "snoozed": "⭐"
}


def dmoj_to_cf(dmoj_difficulty):
    """Convert DMOJ difficulty to Codeforces rating using y = 570x^0.329 * log10(x)
    where x = DMOJ difficulty, y = CF rating
    """
    if dmoj_difficulty <= 0:
        return 0

    # Direct calculation using the formula
    cf_rating = 570 * (dmoj_difficulty ** 0.329) * math.log10(dmoj_difficulty)

    # Round to nearest 25
    return round(cf_rating / 25) * 25


def cf_to_dmoj(cf_rating):
    """Convert Codeforces rating to DMOJ difficulty by inverting y = 570x^0.329 * log10(x)
    where x = DMOJ difficulty, y = CF rating
    Uses binary search to solve for x
    """
    if cf_rating <= 0:
        return 0

    # Use binary search to find DMOJ difficulty
    low, high = 1.0, 100.0
    best_dmoj = 1

    # Binary search with floating point precision
    for _ in range(100):
        mid = (low + high) / 2
        cf_calc = 570 * (mid ** 0.329) * math.log10(mid)

        if abs(cf_calc - cf_rating) < 0.1:
            best_dmoj = mid
            break
        elif cf_calc < cf_rating:
            low = mid
            best_dmoj = mid
        else:
            high = mid

    # Round to nearest integer
    return round(best_dmoj)


def load_problems():
    try:
        with open(PROBLEM_FILE, "r") as f:
            problems = json.load(f)
            needs_save = False

            # Patch old format to new format
            for p in problems:
                # Convert single type string to list
                if "type" in p and isinstance(p["type"], str):
                    p["type"] = [p["type"]] if p["type"] else []
                    needs_save = True
                elif "type" not in p:
                    p["type"] = []
                    needs_save = True

                # Ensure status is valid
                if p.get("status") not in STATUS_EMOJIS:
                    p["status"] = "unsolved"
                    needs_save = True

                # Always recalculate CF rating from DMOJ difficulty
                dmoj_diff = p.get("difficulty", 0)
                if dmoj_diff > 0:
                    calculated_cf = dmoj_to_cf(dmoj_diff)
                    # Only update if different from current value
                    if p.get("cf_rating") != calculated_cf:
                        p["cf_rating"] = calculated_cf
                        needs_save = True
                else:
                    if p.get("cf_rating") != 0:
                        p["cf_rating"] = 0
                        needs_save = True

            # Save back if any changes were made
            if needs_save:
                save_problems(problems)

            return problems
    except FileNotFoundError:
        return []


def save_problems(problems):
    with open(PROBLEM_FILE, "w") as f:
        json.dump(problems, f, indent=4)


def get_all_tags():
    """Get all unique tags from existing problems plus defaults"""
    problems = load_problems()
    tags = set(DEFAULT_PROBLEM_TYPES)
    for p in problems:
        if "type" in p and isinstance(p["type"], list):
            tags.update(p["type"])
    return sorted(list(tags))


class TagSelectionDialog(QDialog):
    def __init__(self, selected_tags=None):
        super().__init__()
        self.setWindowTitle("Select Tags")
        self.setGeometry(200, 200, 400, 500)
        self.selected_tags = selected_tags if selected_tags else []
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()

        # List widget for tag selection
        self.tag_list = QListWidget()
        self.tag_list.setSelectionMode(QListWidget.SelectionMode.MultiSelection)

        all_tags = get_all_tags()
        for tag in all_tags:
            self.tag_list.addItem(tag)

        # Pre-select tags
        for i in range(self.tag_list.count()):
            item = self.tag_list.item(i)
            if item.text() in self.selected_tags:
                item.setSelected(True)

        layout.addWidget(QLabel("Select tags (hold Ctrl/Cmd for multiple):"))
        layout.addWidget(self.tag_list)

        # Custom tag input
        custom_layout = QHBoxLayout()
        self.custom_tag_input = QLineEdit()
        self.custom_tag_input.setPlaceholderText("Add custom tag")
        add_custom_btn = QPushButton("Add Custom Tag")
        add_custom_btn.clicked.connect(self.add_custom_tag)
        custom_layout.addWidget(self.custom_tag_input)
        custom_layout.addWidget(add_custom_btn)
        layout.addLayout(custom_layout)

        # Dialog buttons
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

        self.setLayout(layout)

    def add_custom_tag(self):
        custom_tag = self.custom_tag_input.text().strip()
        if custom_tag:
            # Check if tag already exists
            existing = [self.tag_list.item(i).text() for i in range(self.tag_list.count())]
            if custom_tag not in existing:
                self.tag_list.addItem(custom_tag)
                # Select the newly added tag
                self.tag_list.item(self.tag_list.count() - 1).setSelected(True)
                self.custom_tag_input.clear()
            else:
                QMessageBox.information(self, "Info", "Tag already exists.")

    def get_selected_tags(self):
        return [item.text() for item in self.tag_list.selectedItems()]


class AddProblemWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Add New Problem")
        self.setGeometry(100, 100, 800, 550)
        self.selected_tags = []
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Problem Name")
        layout.addWidget(self.name_input)

        self.platform_input = QLineEdit()
        self.platform_input.setPlaceholderText("Platform")
        layout.addWidget(self.platform_input)

        self.link_input = QLineEdit()
        self.link_input.setPlaceholderText("Link")
        layout.addWidget(self.link_input)

        # Difficulty input with inline radio buttons
        difficulty_container = QHBoxLayout()

        self.rating_button_group = QButtonGroup()
        self.dmoj_radio = QRadioButton("DMOJ")
        self.cf_radio = QRadioButton("CF")
        self.dmoj_radio.setChecked(True)

        self.rating_button_group.addButton(self.dmoj_radio)
        self.rating_button_group.addButton(self.cf_radio)

        self.dmoj_radio.toggled.connect(self.update_difficulty_placeholder)
        self.cf_radio.toggled.connect(self.update_difficulty_placeholder)

        self.difficulty_input = QLineEdit()
        self.difficulty_input.setPlaceholderText("Difficulty (DMOJ)")

        difficulty_container.addWidget(QLabel("Difficulty:"))
        difficulty_container.addWidget(self.dmoj_radio)
        difficulty_container.addWidget(self.cf_radio)
        difficulty_container.addWidget(self.difficulty_input)

        layout.addLayout(difficulty_container)

        # Tag selection button
        tag_layout = QHBoxLayout()
        self.tags_label = QLabel("Tags: None selected")
        select_tags_btn = QPushButton("Select Tags")
        select_tags_btn.clicked.connect(self.open_tag_dialog)
        tag_layout.addWidget(self.tags_label)
        tag_layout.addWidget(select_tags_btn)
        layout.addLayout(tag_layout)

        add_btn = QPushButton("Add Problem")
        add_btn.clicked.connect(self.add_problem)
        layout.addWidget(add_btn)

        self.setLayout(layout)

    def update_difficulty_placeholder(self):
        if self.dmoj_radio.isChecked():
            self.difficulty_input.setPlaceholderText("Difficulty (DMOJ)")
        else:
            self.difficulty_input.setPlaceholderText("Rating (Codeforces)")

    def open_tag_dialog(self):
        dialog = TagSelectionDialog(self.selected_tags)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            self.selected_tags = dialog.get_selected_tags()
            if self.selected_tags:
                self.tags_label.setText(f"Tags: {', '.join(self.selected_tags)}")
            else:
                self.tags_label.setText("Tags: None selected")

    def add_problem(self):
        name = self.name_input.text().strip()
        platform = self.platform_input.text().strip()
        link = self.link_input.text().strip()

        if not name or not platform or not link:
            QMessageBox.warning(self, "Input Error", "All fields must be filled.")
            return

        try:
            input_value = int(self.difficulty_input.text().strip())
        except ValueError:
            QMessageBox.warning(self, "Input Error", "Difficulty must be a number.")
            return

        # Determine DMOJ difficulty and CF rating based on selected system
        if self.cf_radio.isChecked():
            # User entered CF rating, calculate DMOJ
            cf_rating = input_value
            dmoj_difficulty = cf_to_dmoj(cf_rating)
        else:
            # User entered DMOJ difficulty, calculate CF
            dmoj_difficulty = input_value
            cf_rating = dmoj_to_cf(dmoj_difficulty)

        problems = load_problems()
        problems.append({
            "name": name,
            "platform": platform,
            "link": link,
            "difficulty": dmoj_difficulty,
            "cf_rating": cf_rating,
            "status": "unsolved",
            "type": self.selected_tags
        })
        save_problems(problems)

        QMessageBox.information(
            self,
            "Success",
            f"Problem added successfully.\nDMOJ Difficulty: {dmoj_difficulty}\nCF Rating: {cf_rating}"
        )
        self.close()


class MarkSolvedWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Change Problem Status")
        self.setGeometry(100, 100, 900, 600)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()
        self.link_input = QLineEdit()
        self.link_input.setPlaceholderText("Problem Link")
        layout.addWidget(self.link_input)

        # Status selection
        status_layout = QHBoxLayout()
        status_layout.addWidget(QLabel("New Status:"))
        self.status_combo = QComboBox()
        self.status_combo.addItems(["unsolved", "solving", "solved", "snoozed"])
        status_layout.addWidget(self.status_combo)
        layout.addLayout(status_layout)

        mark_btn = QPushButton("Update Status")
        mark_btn.clicked.connect(self.mark_solved)
        layout.addWidget(mark_btn)

        self.setLayout(layout)

    def mark_solved(self):
        link = self.link_input.text().strip()
        new_status = self.status_combo.currentText()
        problems = load_problems()
        found = False
        for p in problems:
            if p["link"] == link:
                p["status"] = new_status
                found = True
                break
        if found:
            save_problems(problems)
            QMessageBox.information(self, "Success", f"Problem status updated to {new_status}.")
            self.close()
        else:
            QMessageBox.warning(self, "Not Found", "Problem not found.")


class FilterProblemWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("View Problems with Filters")
        self.setGeometry(100, 100, 1200, 700)
        self.selected_filter_tags = []
        self.use_cf_rating = False  # Toggle for rating display
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()

        filter_layout = QVBoxLayout()

        # First row: Platform and Status
        row1 = QHBoxLayout()
        self.platform_filter = QLineEdit()
        self.platform_filter.setPlaceholderText("Platform")
        row1.addWidget(QLabel("Platform:"))
        row1.addWidget(self.platform_filter)

        self.status_filter = QComboBox()
        self.status_filter.addItems(["all", "unsolved", "solving", "solved", "snoozed"])
        row1.addWidget(QLabel("Status:"))
        row1.addWidget(self.status_filter)
        filter_layout.addLayout(row1)

        # Second row: Rating system toggle
        row2 = QHBoxLayout()
        row2.addWidget(QLabel("Rating System:"))
        self.rating_button_group = QButtonGroup()
        self.dmoj_rating_radio = QRadioButton("DMOJ")
        self.cf_rating_radio = QRadioButton("Codeforces")
        self.dmoj_rating_radio.setChecked(True)

        self.rating_button_group.addButton(self.dmoj_rating_radio)
        self.rating_button_group.addButton(self.cf_rating_radio)

        self.dmoj_rating_radio.toggled.connect(self.toggle_rating_system)

        row2.addWidget(self.dmoj_rating_radio)
        row2.addWidget(self.cf_rating_radio)
        filter_layout.addLayout(row2)

        # Third row: Difficulty range
        row3 = QHBoxLayout()
        self.min_difficulty = QLineEdit()
        self.min_difficulty.setPlaceholderText("Min Difficulty")
        self.max_difficulty = QLineEdit()
        self.max_difficulty.setPlaceholderText("Max Difficulty")
        self.difficulty_range_label = QLabel("DMOJ Difficulty Range:")
        row3.addWidget(self.difficulty_range_label)
        row3.addWidget(self.min_difficulty)
        row3.addWidget(QLabel("to"))
        row3.addWidget(self.max_difficulty)
        filter_layout.addLayout(row3)

        # Fourth row: Tags
        row4 = QHBoxLayout()
        self.tags_filter_label = QLabel("Tags: All")
        select_filter_tags_btn = QPushButton("Select Tags to Filter")
        select_filter_tags_btn.clicked.connect(self.open_tag_filter_dialog)
        row4.addWidget(self.tags_filter_label)
        row4.addWidget(select_filter_tags_btn)
        filter_layout.addLayout(row4)

        # Apply button
        apply_btn = QPushButton("Apply Filters")
        apply_btn.clicked.connect(self.apply_filters)
        filter_layout.addWidget(apply_btn)

        layout.addLayout(filter_layout)

        self.problem_table = QTableWidget()
        self.problem_table.setColumnCount(6)
        self.problem_table.setHorizontalHeaderLabels([
            "Status", "Problem Name", "Link", "Platform", "Tags", "DMOJ Diff"
        ])
        self.problem_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.problem_table.cellClicked.connect(self.handle_cell_click)
        layout.addWidget(self.problem_table)

        self.setLayout(layout)
        self.apply_filters()

    def toggle_rating_system(self):
        self.use_cf_rating = self.cf_rating_radio.isChecked()

        # Update labels
        if self.use_cf_rating:
            self.difficulty_range_label.setText("CF Rating Range:")
            self.min_difficulty.setPlaceholderText("Min CF Rating")
            self.max_difficulty.setPlaceholderText("Max CF Rating")
            headers = ["Status", "Problem Name", "Link", "Platform", "Tags", "CF Rating"]
        else:
            self.difficulty_range_label.setText("DMOJ Difficulty Range:")
            self.min_difficulty.setPlaceholderText("Min Difficulty")
            self.max_difficulty.setPlaceholderText("Max Difficulty")
            headers = ["Status", "Problem Name", "Link", "Platform", "Tags", "DMOJ Diff"]

        self.problem_table.setHorizontalHeaderLabels(headers)
        self.apply_filters()

    def open_tag_filter_dialog(self):
        dialog = TagSelectionDialog(self.selected_filter_tags)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            self.selected_filter_tags = dialog.get_selected_tags()
            if self.selected_filter_tags:
                self.tags_filter_label.setText(f"Tags: {', '.join(self.selected_filter_tags)}")
            else:
                self.tags_filter_label.setText("Tags: All")

    def apply_filters(self):
        problems = load_problems()
        platform = self.platform_filter.text().lower().strip()
        status = self.status_filter.currentText()

        try:
            min_val = int(self.min_difficulty.text()) if self.min_difficulty.text() else None
            max_val = int(self.max_difficulty.text()) if self.max_difficulty.text() else None
        except ValueError:
            QMessageBox.warning(self, "Invalid Input", "Difficulty/Rating filters must be numbers.")
            return

        filtered = []
        for p in problems:
            if platform and platform not in p["platform"].lower():
                continue
            if status != "all" and p["status"] != status:
                continue

            # Get the appropriate rating value based on toggle
            if self.use_cf_rating:
                rating_value = p.get("cf_rating", 0)
            else:
                rating_value = p.get("difficulty", 99999)

            try:
                rating_value = int(rating_value)
            except:
                continue

            if min_val is not None and rating_value < min_val:
                continue
            if max_val is not None and rating_value > max_val:
                continue

            # Tag filtering: problem must have at least one of the selected tags
            if self.selected_filter_tags:
                problem_tags = p.get("type", [])
                if not any(tag in problem_tags for tag in self.selected_filter_tags):
                    continue

            filtered.append(p)

        # Sort by the appropriate rating
        if self.use_cf_rating:
            filtered.sort(key=lambda p: int(p.get("cf_rating", 0)))
        else:
            filtered.sort(key=lambda p: int(p.get("difficulty", 99999)))

        self.problem_table.setRowCount(len(filtered))

        for row, p in enumerate(filtered):
            status_emoji = STATUS_EMOJIS.get(p["status"], "❓")
            self.problem_table.setItem(row, 0, QTableWidgetItem(status_emoji))
            self.problem_table.setItem(row, 1, QTableWidgetItem(p.get("name", "Unnamed")))
            self.problem_table.setItem(row, 2, QTableWidgetItem(p["link"]))
            self.problem_table.setItem(row, 3, QTableWidgetItem(p["platform"]))

            tags = p.get("type", [])
            tags_str = ", ".join(tags) if tags else "None"
            self.problem_table.setItem(row, 4, QTableWidgetItem(tags_str))

            # Display the appropriate rating based on toggle
            if self.use_cf_rating:
                rating_display = str(p.get("cf_rating", 0))
            else:
                rating_display = str(p.get("difficulty", 0))

            self.problem_table.setItem(row, 5, QTableWidgetItem(rating_display))

    def handle_cell_click(self, row, column):
        if column == 2:
            link = self.problem_table.item(row, column).text()
            webbrowser.open(link)


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Problem Tracker")
        self.setGeometry(100, 100, 600, 300)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()

        add_btn = QPushButton("➕ Add New Problem")
        add_btn.clicked.connect(self.open_add_problem)
        layout.addWidget(add_btn)

        solve_btn = QPushButton("🔄 Change Problem Status")
        solve_btn.clicked.connect(self.open_mark_solved)
        layout.addWidget(solve_btn)

        view_btn = QPushButton("📄 View Problems with Filters")
        view_btn.clicked.connect(self.open_filter_window)
        layout.addWidget(view_btn)

        self.setLayout(layout)

    def open_add_problem(self):
        self.add_window = AddProblemWindow()
        self.add_window.show()

    def open_mark_solved(self):
        self.solve_window = MarkSolvedWindow()
        self.solve_window.show()

    def open_filter_window(self):
        self.filter_window = FilterProblemWindow()
        self.filter_window.show()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())