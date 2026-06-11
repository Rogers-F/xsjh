package common

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"strings"

	"github.com/gin-contrib/static"
)

// Credit: https://github.com/gin-contrib/static/issues/19

type embedFileSystem struct {
	http.FileSystem
}

func (e *embedFileSystem) Exists(prefix string, path string) bool {
	// The request path still carries the static.Serve() mount prefix (e.g.
	// "/admin/static/app.js" for static.Serve("/admin", ...)), but the embedded
	// files live without it ("static/app.js"). Strip the prefix before probing,
	// exactly as the http.StripPrefix wrapper does for the file server itself —
	// otherwise every sub-path mount (the React console under /admin) misses and
	// falls through to the SPA index, serving HTML for .js/.css (white screen).
	// The root mount ("/") is unaffected: stripping "/" is a no-op for lookups.
	name := strings.TrimPrefix(path, prefix)
	if len(name) == len(path) {
		// path doesn't carry this mount's prefix, so it isn't served here.
		// Return false (don't probe the raw path) so this mount can't "claim" a
		// sibling mount's file: static.Serve registers /admin before /, and if
		// the /admin FS happened to hold a root-named file it would claim it,
		// then http.StripPrefix("/admin") would 404 — starving the root FS.
		return false
	}
	_, err := e.Open(name)
	return err == nil
}

func (e *embedFileSystem) Open(name string) (http.File, error) {
	if name == "/" {
		// This will make sure the index page goes to NoRouter handler,
		// which will use the replaced index bytes with analytic codes.
		return nil, os.ErrNotExist
	}
	return e.FileSystem.Open(name)
}

func EmbedFolder(fsEmbed embed.FS, targetPath string) static.ServeFileSystem {
	efs, err := fs.Sub(fsEmbed, targetPath)
	if err != nil {
		panic(err)
	}
	return &embedFileSystem{
		FileSystem: http.FS(efs),
	}
}

// themeAwareFileSystem delegates to the appropriate embedded FS based on
// the current theme (via GetTheme). This enables runtime theme switching
// without restarting the server.
type themeAwareFileSystem struct {
	defaultFS static.ServeFileSystem
	classicFS static.ServeFileSystem
}

func (t *themeAwareFileSystem) Exists(prefix string, path string) bool {
	if GetTheme() == "classic" {
		return t.classicFS.Exists(prefix, path)
	}
	return t.defaultFS.Exists(prefix, path)
}

func (t *themeAwareFileSystem) Open(name string) (http.File, error) {
	if GetTheme() == "classic" {
		return t.classicFS.Open(name)
	}
	return t.defaultFS.Open(name)
}

func NewThemeAwareFS(defaultFS, classicFS static.ServeFileSystem) static.ServeFileSystem {
	return &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
}
