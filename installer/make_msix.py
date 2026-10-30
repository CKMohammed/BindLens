"""The Microsoft Store package of BindLens (MSIX): the program built by PyInstaller, a manifest and its tiles.
Microsoft signs it when it is published in the Store - no certificate needed here.
usage: python installer/make_msix.py <dist folder> <out folder> <version a.b.c.0> [reader]
  reader: AZBook Reader (BookReader.exe) instead of BindLens"""
import os, shutil, sys
from PIL import Image

dist, out, ver = sys.argv[1], sys.argv[2], sys.argv[3]
READER = len(sys.argv) > 4 and sys.argv[4] == "reader"
ID, NAME, EXE, APPID = (("BindLens.AZBookReader", "AZBook Reader", "BookReader.exe", "AZBookReader") if READER
                        else ("BindLens.BindLens", "BindLens", "BindLens.exe", "BindLens"))
DESC = "Read, organise and find anything in your documents." if READER else "Your documents, bound into books."
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.exists(out):
    shutil.rmtree(out)
shutil.copytree(dist, out)
os.makedirs(os.path.join(out, "Assets"), exist_ok=True)
src = (Image.open(os.path.join(root, "BookReader.ico")) if READER else
       Image.open(os.path.join(root, "docs", "app", "icon-512.png"))).convert("RGBA")


def tile(name, w, h, pad=0.12):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    s = int(min(w, h) * (1 - 2 * pad))
    im.alpha_composite(src.resize((s, s), Image.LANCZOS), ((w - s) // 2, (h - s) // 2))
    im.save(os.path.join(out, "Assets", name))


tile("StoreLogo.png", 50, 50, 0.04)
tile("Square44x44Logo.png", 44, 44, 0.04)
tile("Square44x44Logo.targetsize-256_altform-unplated.png", 256, 256, 0.02)
tile("Square150x150Logo.png", 150, 150, 0.16)
tile("Wide310x150Logo.png", 310, 150, 0.16)
manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="{ID}" Publisher="CN=050E3A31-542B-4D98-A9A9-D2F2AD57FF8F" Version="{ver}" ProcessorArchitecture="x64"/>
  <Properties>
    <DisplayName>{NAME}</DisplayName>
    <PublisherDisplayName>BindLens</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0"/>
  </Dependencies>
  <Resources>
    <Resource Language="en-us"/>
    <Resource Language="es-es"/>
  </Resources>
  <Applications>
    <Application Id="{APPID}" Executable="{EXE}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="{NAME}" Description="{DESC}" BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\\Wide310x150Logo.png"/>
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust"/>
  </Capabilities>
</Package>
"""
open(os.path.join(out, "AppxManifest.xml"), "w", encoding="utf-8").write(manifest)
print("MSIX folder ready:", out, ver)
