# Maintainer: Lucasion <lucasion@hotmail.com>
pkgname=archion-settings
pkgver=0.1.0
pkgrel=1
pkgdesc="A modern settings panel for Archion with display configuration"
arch=('x86_64')
url="https://github.com/LucasionGS/hypr-settings.git"
license=('MIT')
depends=('webkit2gtk' 'gtk3' 'libayatana-appindicator')
makedepends=('rust' 'cargo' 'nodejs' 'npm' 'git')
source=("git+https://github.com/LucasionGS/hypr-settings.git")
sha256sums=('SKIP')

prepare() {
    cd "$srcdir/hypr-settings"
    # Install frontend dependencies
    npm install
}

build() {
    cd "$srcdir/hypr-settings"
    
    # Set environment variable for WebKit
    export WEBKIT_DISABLE_DMABUF_RENDERER=1
    
    # Build the frontend
    npm run build
    
    # Build the Tauri application
    cd src-tauri
    cargo build --release
}

package() {
    cd "$srcdir/hypr-settings"
    
    # Install the binary
    install -Dm755 "src-tauri/target/release/$pkgname" "$pkgdir/usr/bin/$pkgname"
    
    # Install desktop file
    install -Dm644 "$pkgname.desktop" "$pkgdir/usr/share/applications/$pkgname.desktop"
    
    # Install icons
    install -Dm644 "src-tauri/icons/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/$pkgname.png"
    install -Dm644 "src-tauri/icons/32x32.png" "$pkgdir/usr/share/icons/hicolor/32x32/apps/$pkgname.png"
    
    # Install documentation
    install -Dm644 "README.md" "$pkgdir/usr/share/doc/$pkgname/README.md"
}
