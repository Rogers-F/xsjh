package common

import (
	"net/http"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

// TestEmbedFileSystemExistsStripsMountPrefix pins the fix for the /admin React
// console white-screen. static.Serve("/admin", fs) probes Exists with the full
// request path (carrying the /admin mount prefix), but the embedded files live
// without it. If the prefix is not stripped, every /admin/static/* asset misses
// and the SPA index (HTML) is served for .js/.css, breaking the console.
func TestEmbedFileSystemExistsStripsMountPrefix(t *testing.T) {
	e := &embedFileSystem{FileSystem: http.FS(fstest.MapFS{
		"static/js/app.js": {Data: []byte("console.log(1)")},
		"assets/main.css":  {Data: []byte("body{}")},
		"index.html":       {Data: []byte("<!doctype html>")},
	})}

	// Sub-path mount (/admin): the request path carries /admin, the file does not.
	require.True(t, e.Exists("/admin", "/admin/static/js/app.js"), "console asset under /admin must resolve")
	require.False(t, e.Exists("/admin", "/admin/static/js/missing.js"), "missing asset must not resolve")

	// Root mount (/): behavior unchanged — assets still resolve.
	require.True(t, e.Exists("/", "/assets/main.css"), "root asset must resolve")
	require.False(t, e.Exists("/", "/no-such.js"), "missing root asset must not resolve")

	// A path that does NOT carry this mount's prefix must not be claimed here
	// (static.Serve registers /admin before /); otherwise the /admin mount could
	// shadow a root-site path it cannot actually serve, starving the root FS.
	require.False(t, e.Exists("/admin", "/logo.png"), "/admin mount must not claim root-site paths")
	require.False(t, e.Exists("/admin", "/assets/main.css"), "root asset is not the /admin mount's")

	// Path traversal must never resolve (fs.Sub/http.FS reject "..").
	require.False(t, e.Exists("/admin", "/admin/../static/js/app.js"), "traversal must not resolve")

	// The index ("/") and the /admin root must NOT resolve as files, so they fall
	// through to NoRoute where the per-request-injected index bytes are served.
	require.False(t, e.Exists("/", "/"), "root index must go to NoRoute")
	require.False(t, e.Exists("/admin", "/admin"), "/admin index must go to NoRoute")
}
