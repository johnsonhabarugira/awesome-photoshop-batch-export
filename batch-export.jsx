#target photoshop

/*
<javascriptresource>
<name>AWESOME Batch Export by Johnson</name>
<category>Johnson Dev</category>
</javascriptresource>
*/

/**
 * AWESOME Batch Export by Johnson
 * --------------------------------
 * Exports every open Photoshop document to JPG or PNG with sequential
 * names (e.g. Photo_01.jpg, Photo_02.jpg ...), a progress window and a
 * fade-out finish.
 *
 * Originals are never modified: each document is duplicated, prepared
 * (flattened / converted to 8-bit / RGB if needed), saved, and the
 * duplicate is closed.
 *
 * Author : Johnson Dev (habarugirajohnson@gmail.com)
 * License: MIT
 * Version: 1.0.0
 */

(function () {
    var SCRIPT_NAME = "AWESOME Batch Export by Johnson";
    var VERSION = "1.0.0";
    var SETTINGS_ID = "com.johnsondev.batchexport.settings";

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    function trim(s) {
        return String(s).replace(/^\s+|\s+$/g, "");
    }

    function sanitizeName(s) {
        return trim(s).replace(/[\\\/:\*\?"<>\|]/g, "_");
    }

    function pad(n, width) {
        var s = String(n);
        while (s.length < width) s = "0" + s;
        return s;
    }

    function refresh(win) {
        try {
            win.update();
        } catch (e) {
            try { app.refresh(); } catch (e2) {}
        }
    }

    function defaultFolder() {
        try {
            return app.activeDocument.path; // throws if the doc was never saved
        } catch (e) {
            return Folder.desktop;
        }
    }

    // ------------------------------------------------------------------
    // Settings (remembered between runs)
    // ------------------------------------------------------------------
    function key(name) {
        return stringIDToTypeID(name);
    }

    function loadSettings() {
        var s = {
            folder: defaultFolder(),
            baseName: "Photo",
            startAt: 1,
            format: "JPG",
            quality: 10,
            overwrite: false,
            openFolder: true
        };
        try {
            var d = app.getCustomOptions(SETTINGS_ID);
            if (d.hasKey(key("folder"))) {
                var f = new Folder(d.getString(key("folder")));
                if (f.exists) s.folder = f;
            }
            if (d.hasKey(key("baseName"))) s.baseName = d.getString(key("baseName"));
            if (d.hasKey(key("format"))) s.format = d.getString(key("format"));
            if (d.hasKey(key("quality"))) s.quality = d.getInteger(key("quality"));
            if (d.hasKey(key("overwrite"))) s.overwrite = d.getBoolean(key("overwrite"));
            if (d.hasKey(key("openFolder"))) s.openFolder = d.getBoolean(key("openFolder"));
        } catch (e) {
            // First run: no saved settings yet.
        }
        return s;
    }

    function saveSettings(s) {
        try {
            var d = new ActionDescriptor();
            d.putString(key("folder"), s.folder.fsName);
            d.putString(key("baseName"), s.baseName);
            d.putString(key("format"), s.format);
            d.putInteger(key("quality"), s.quality);
            d.putBoolean(key("overwrite"), s.overwrite);
            d.putBoolean(key("openFolder"), s.openFolder);
            app.putCustomOptions(SETTINGS_ID, d, true);
        } catch (e) {}
    }

    // ------------------------------------------------------------------
    // Main dialog
    // ------------------------------------------------------------------
    function showDialog(settings, docCount) {
        var w = new Window("dialog", SCRIPT_NAME + "  v" + VERSION);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 12;
        w.margins = 18;

        var header = w.add("statictext", undefined,
            "Ready to export " + docCount + " open document" + (docCount === 1 ? "" : "s"));
        try { header.graphics.font = ScriptUI.newFont("dialog", "BOLD", 15); } catch (e) {}

        // --- Save location ---
        var pFolder = w.add("panel", undefined, "Save location");
        pFolder.orientation = "row";
        pFolder.alignChildren = ["left", "center"];
        pFolder.margins = [12, 16, 12, 12];
        var folderText = pFolder.add("edittext", undefined, settings.folder ? settings.folder.fsName : "");
        folderText.preferredSize.width = 320;
        var browseBtn = pFolder.add("button", undefined, "Browse...");
        browseBtn.onClick = function () {
            var start = new Folder(folderText.text);
            var picked = start.exists
                ? start.selectDlg("Choose the export folder")
                : Folder.selectDialog("Choose the export folder");
            if (picked) folderText.text = picked.fsName;
        };

        // --- Naming ---
        var pName = w.add("panel", undefined, "File naming");
        pName.orientation = "column";
        pName.alignChildren = ["fill", "top"];
        pName.margins = [12, 16, 12, 12];

        var rowName = pName.add("group");
        rowName.add("statictext", undefined, "Base name:").preferredSize.width = 80;
        var nameText = rowName.add("edittext", undefined, settings.baseName);
        nameText.preferredSize.width = 200;

        var rowStart = pName.add("group");
        rowStart.add("statictext", undefined, "Start at:").preferredSize.width = 80;
        var startText = rowStart.add("edittext", undefined, String(settings.startAt));
        startText.characters = 5;

        var preview = pName.add("statictext", undefined, "");
        preview.preferredSize.width = 380;

        // --- Format ---
        var pFormat = w.add("panel", undefined, "Format");
        pFormat.orientation = "column";
        pFormat.alignChildren = ["fill", "top"];
        pFormat.margins = [12, 16, 12, 12];

        var rowFmt = pFormat.add("group");
        var rbJpg = rowFmt.add("radiobutton", undefined, "JPG  (small files, web & sharing)");
        var rbPng = rowFmt.add("radiobutton", undefined, "PNG  (lossless, keeps transparency)");
        rbJpg.value = settings.format !== "PNG";
        rbPng.value = settings.format === "PNG";

        var rowQ = pFormat.add("group");
        rowQ.add("statictext", undefined, "JPG quality:");
        var qSlider = rowQ.add("slider", undefined, settings.quality, 0, 12);
        qSlider.preferredSize.width = 200;
        var qLabel = rowQ.add("statictext", undefined, String(settings.quality) + " / 12");
        qLabel.characters = 6;
        qSlider.onChanging = function () {
            qSlider.value = Math.round(qSlider.value);
            qLabel.text = qSlider.value + " / 12";
        };

        // --- Options ---
        var pOpt = w.add("panel", undefined, "Options");
        pOpt.orientation = "column";
        pOpt.alignChildren = ["left", "top"];
        pOpt.margins = [12, 16, 12, 12];
        var cbOverwrite = pOpt.add("checkbox", undefined, "Overwrite files that already exist");
        cbOverwrite.value = settings.overwrite;
        var cbOpen = pOpt.add("checkbox", undefined, "Open the folder when finished");
        cbOpen.value = settings.openFolder;

        // --- Buttons ---
        var btns = w.add("group");
        btns.alignment = ["right", "top"];
        var cancelBtn = btns.add("button", undefined, "Cancel", { name: "cancel" });
        var okBtn = btns.add("button", undefined, "Start Export", { name: "ok" });

        function currentExt() { return rbPng.value ? ".png" : ".jpg"; }

        function updateUI() {
            rowQ.enabled = rbJpg.value;
            var base = sanitizeName(nameText.text) || "Photo";
            var start = parseInt(startText.text, 10);
            if (isNaN(start) || start < 0) start = 1;
            var width = Math.max(2, String(start + docCount - 1).length);
            var first = base + "_" + pad(start, width) + currentExt();
            var last = base + "_" + pad(start + docCount - 1, width) + currentExt();
            preview.text = "Preview:  " + first + (docCount > 1 ? "  ...  " + last : "");
        }

        nameText.onChanging = updateUI;
        startText.onChanging = updateUI;
        rbJpg.onClick = updateUI;
        rbPng.onClick = updateUI;
        updateUI();

        var result = null;
        okBtn.onClick = function () {
            var folder = new Folder(trim(folderText.text));
            if (!trim(folderText.text)) {
                alert("Please choose a save location.", SCRIPT_NAME);
                return;
            }
            if (!folder.exists) {
                if (!confirm("This folder does not exist:\n" + folder.fsName + "\n\nCreate it?")) return;
                if (!folder.create()) {
                    alert("Could not create the folder.", SCRIPT_NAME);
                    return;
                }
            }
            var base = sanitizeName(nameText.text);
            if (!base) {
                alert("Please enter a base file name.", SCRIPT_NAME);
                return;
            }
            var start = parseInt(startText.text, 10);
            if (isNaN(start) || start < 0) {
                alert("\"Start at\" must be a whole number (0 or more).", SCRIPT_NAME);
                return;
            }
            result = {
                folder: folder,
                baseName: base,
                startAt: start,
                format: rbPng.value ? "PNG" : "JPG",
                quality: Math.round(qSlider.value),
                overwrite: cbOverwrite.value,
                openFolder: cbOpen.value
            };
            w.close(1);
        };
        cancelBtn.onClick = function () { w.close(0); };

        w.center();
        return w.show() === 1 ? result : null;
    }

    // ------------------------------------------------------------------
    // Progress window
    // ------------------------------------------------------------------
    function createProgress(total) {
        var w = new Window("palette", SCRIPT_NAME);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.margins = 18;
        w.spacing = 10;

        var title = w.add("statictext", undefined, "Exporting your images...");
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch (e) {}

        var bar = w.add("progressbar", undefined, 0, total);
        bar.preferredSize = [400, 14];

        var status = w.add("statictext", undefined, "Preparing...");
        status.preferredSize.width = 400;
        var count = w.add("statictext", undefined, "0 / " + total + "  (0%)");

        var cancelBtn = w.add("button", undefined, "Stop");
        cancelBtn.alignment = ["right", "top"];

        var state = { cancelled: false };
        cancelBtn.onClick = function () {
            state.cancelled = true;
            cancelBtn.enabled = false;
            status.text = "Stopping after the current file...";
            refresh(w);
        };

        state.update = function (done, msg) {
            bar.value = done;
            if (msg) status.text = msg;
            count.text = done + " / " + total + "  (" + Math.round((done / total) * 100) + "%)";
            refresh(w);
        };

        state.finish = function (msg) {
            title.text = msg;
            cancelBtn.visible = false;
            refresh(w);
            $.sleep(500);
            // Smooth fade-out (falls back silently if opacity isn't supported)
            for (var o = 1.0; o >= 0; o -= 0.08) {
                try { w.opacity = o; } catch (e) { break; }
                refresh(w);
                $.sleep(25);
            }
            w.close();
        };

        w.center();
        w.show();
        refresh(w);
        return state;
    }

    // ------------------------------------------------------------------
    // Export one document (works on a duplicate; original untouched)
    // ------------------------------------------------------------------
    function exportOne(doc, file, s) {
        app.activeDocument = doc;
        var dup = doc.duplicate(doc.name + "_export_tmp");
        try {
            // Flatten so the output matches what you see on screen
            if (s.format === "JPG") {
                dup.flatten();
            } else {
                try { dup.mergeVisibleLayers(); } catch (e) {} // keeps transparency
            }

            // JPG/PNG need 8 bits per channel
            if (dup.bitsPerChannel !== BitsPerChannelType.EIGHT) {
                dup.bitsPerChannel = BitsPerChannelType.EIGHT;
            }

            // Normalise colour modes the formats can't handle
            if (dup.mode === DocumentMode.BITMAP) {
                dup.changeMode(ChangeMode.GRAYSCALE);
            }
            if (dup.mode === DocumentMode.INDEXEDCOLOR ||
                dup.mode === DocumentMode.MULTICHANNEL ||
                dup.mode === DocumentMode.DUOTONE ||
                dup.mode === DocumentMode.LAB ||
                (s.format === "PNG" && dup.mode === DocumentMode.CMYK)) {
                dup.changeMode(ChangeMode.RGB);
            }

            var opts;
            if (s.format === "JPG") {
                opts = new JPEGSaveOptions();
                opts.quality = s.quality;
                opts.embedColorProfile = true;
                opts.formatOptions = FormatOptions.STANDARDBASELINE;
                opts.matte = MatteType.NONE;
            } else {
                opts = new PNGSaveOptions();
                opts.compression = 6;
                opts.interlaced = false;
            }

            dup.saveAs(file, opts, true, Extension.LOWERCASE);
        } finally {
            dup.close(SaveOptions.DONOTSAVECHANGES);
        }
    }

    // ------------------------------------------------------------------
    // Run
    // ------------------------------------------------------------------
    function run() {
        if (app.documents.length === 0) {
            alert("Open the documents you want to export first, then run the script again.", SCRIPT_NAME);
            return;
        }

        var docs = [];
        for (var i = 0; i < app.documents.length; i++) docs.push(app.documents[i]);
        var total = docs.length;

        var settings = showDialog(loadSettings(), total);
        if (!settings) return; // cancelled
        saveSettings(settings);

        var original = app.activeDocument;
        var oldDialogs = app.displayDialogs;
        app.displayDialogs = DialogModes.NO;

        var ext = settings.format === "JPG" ? ".jpg" : ".png";
        var width = Math.max(2, String(settings.startAt + total - 1).length);
        var exported = 0;
        var skipped = [];
        var failed = [];
        var processed = 0;

        var progress = createProgress(total);

        try {
            for (var j = 0; j < total; j++) {
                if (progress.cancelled) break;

                var doc = docs[j];
                var outName = settings.baseName + "_" + pad(settings.startAt + j, width) + ext;
                var file = new File(settings.folder.fsName + "/" + outName);

                progress.update(j, "Exporting  " + doc.name + "  ->  " + outName);

                if (file.exists && !settings.overwrite) {
                    skipped.push(outName);
                } else {
                    try {
                        exportOne(doc, file, settings);
                        exported++;
                    } catch (e) {
                        failed.push(doc.name + ": " + e.message);
                    }
                }
                processed = j + 1;
                progress.update(processed, null);
            }
        } finally {
            app.displayDialogs = oldDialogs;
            try { app.activeDocument = original; } catch (e) {}
        }

        progress.finish(progress.cancelled ? "Export stopped." : "All done!");

        // Summary
        var msg = "Exported " + exported + " of " + total + " file" + (total === 1 ? "" : "s") +
                  " to:\n" + settings.folder.fsName;
        if (progress.cancelled) msg += "\n\nStopped by you after " + processed + " document(s).";
        if (skipped.length) msg += "\n\nSkipped (already exist):\n- " + skipped.join("\n- ");
        if (failed.length) msg += "\n\nFailed:\n- " + failed.join("\n- ");
        alert(msg, SCRIPT_NAME);

        if (settings.openFolder && exported > 0) {
            try { settings.folder.execute(); } catch (e) {}
        }
    }

    run();
})();
