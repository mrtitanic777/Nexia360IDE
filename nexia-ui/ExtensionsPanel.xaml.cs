/*
 * ExtensionsPanel.xaml.cs — installed extensions, via nexia-core.
 *
 * Lists what `extensions list` returns and points at the extensions folder so
 * you can drop new ones in. Install-from-UI (which needs the manifest read) is a
 * later addition; the folder + the list are the working core.
 */
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows.Controls;

namespace NexiaUI
{
    public class ExtItem
    {
        public string Name { get; set; }
        public string Detail { get; set; }
    }

    public partial class ExtensionsPanel : UserControl
    {
        string _dir;

        public ExtensionsPanel() { InitializeComponent(); Loaded += (s, e) => Refresh(); }

        void Refresh()
        {
            var dir = CoreBridge.ParseObject(CoreBridge.Run("extensions dir"));
            _dir = CoreBridge.Str(dir, "path");
            DirText.Text = _dir;

            var res = CoreBridge.ParseObject(CoreBridge.Run("extensions list"));
            var arr = CoreBridge.Get(res, "extensions") as object[];
            var items = new List<ExtItem>();
            if (arr != null)
                foreach (var it in arr)
                {
                    var d = it as Dictionary<string, object>;
                    if (d == null) continue;
                    string name = CoreBridge.Str(d, "name");
                    if (string.IsNullOrEmpty(name)) name = CoreBridge.Str(d, "id", "(extension)");
                    string ver = CoreBridge.Str(d, "version");
                    string desc = CoreBridge.Str(d, "description");
                    items.Add(new ExtItem { Name = name, Detail = (ver.Length > 0 ? "v" + ver + "  " : "") + desc });
                }

            if (items.Count == 0)
                items.Add(new ExtItem { Name = "No extensions installed", Detail = "Drop a folder or .zip into the extensions folder, then Refresh." });
            List.ItemsSource = items;
        }

        void OnRefresh(object sender, System.Windows.RoutedEventArgs e) { Refresh(); }

        void OnOpenFolder(object sender, System.Windows.RoutedEventArgs e)
        {
            try { if (!string.IsNullOrEmpty(_dir)) Process.Start("explorer.exe", "\"" + _dir + "\""); }
            catch { }
        }
    }
}
