"""Auto screenshot dokumentasi Aristotle POS (toko_demo, data cloud asli).
Alur: buka app, masuk demo bila perlu, rapikan antrian jadi 1 kosong,
isi keranjang contoh (2 Nasi Goreng + 4 Tahu Crispy + 2 Mie Ayam = Rp106rb),
foto POS, pembayaran, printer, laporan, kelola menu.
Hasil: docs/images/screenshot-*.png (1440x900, scale 2).
Butuh server: node scripts/serve.js di http://127.0.0.1:8089/
"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:8089/"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "images"
OUT.mkdir(parents=True, exist_ok=True)

CLEAN_JS = """
() => {
  try { document.getElementById('appSplashScreen')?.remove(); } catch(e) {}
  document.documentElement.classList.remove('fonts-loading');
  document.querySelectorAll('[id*="toast"], [class*="toast"]').forEach(el => {
    try { el.style.opacity = '0'; el.style.pointerEvents = 'none'; } catch(e) {}
  });
  window.scrollTo(0, 0);
}
"""

CLEANUP_JS = """
() => {
  const tabs = Array.from(document.querySelectorAll('#orderQueueTabs [data-qid]'))
    .map(el => el.getAttribute('data-qid')).filter(Boolean);
  let n = 0;
  for (const qid of tabs) {
    try { window.KasirApp.deleteOrderQueue(qid); n++; } catch(e) {}
  }
  return n;
}
"""

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900},
                                  device_scale_factor=2, locale="id-ID",
                                  timezone_id="Asia/Makassar")
        page = ctx.new_page()
        print(f"Buka {BASE_URL} ...")
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_function("() => !!window.KasirApp", timeout=30000)
        page.wait_for_selector("#productGrid", timeout=30000)
        page.wait_for_timeout(2500)
        page.evaluate(CLEAN_JS)

        sid = page.evaluate("() => localStorage.getItem('kasir_active_store_id')")
        print("store aktif:", sid)
        if not sid:
            print("Buat Toko Demo ...")
            page.evaluate("() => window.KasirApp.quickDemoStore()")
            page.wait_for_timeout(2500)
            page.evaluate(CLEAN_JS)

        # tunggu sinkron cloud selesai agar katalog asli tampil
        page.wait_for_timeout(3500)
        nmenu = page.evaluate("() => document.getElementById('productGrid')?.children?.length")
        print("kartu menu tampil:", nmenu)

        # rapikan antrian: hapus semua sisa uji coba jadi 1 antrian kosong
        removed = page.evaluate(CLEANUP_JS)
        page.wait_for_timeout(1200)
        page.evaluate(CLEAN_JS)
        print("antrian lama dihapus:", removed)

        # isi keranjang contoh yang rapi
        page.evaluate("() => { try { window.KasirApp.switchView('pos'); } catch(e){} }")
        page.wait_for_timeout(500)
        for pid, qty in [("p1", 2), ("p10", 4), ("p2", 2)]:
            for _ in range(qty):
                page.evaluate(f"() => {{ try {{ window.KasirApp.addToCart('{pid}'); }} catch(e) {{}} }}")
                page.wait_for_timeout(90)
        page.wait_for_timeout(1000)
        page.evaluate(CLEAN_JS)
        total = page.evaluate("() => document.getElementById('cartTotalDisplay')?.innerText")
        print("total keranjang:", total)

        # 1. POS
        page.evaluate("() => { try { window.KasirApp.switchView('pos'); } catch(e){} window.scrollTo(0,0); }")
        page.wait_for_timeout(900)
        page.evaluate(CLEAN_JS)
        out = OUT / "screenshot-pos.png"
        page.screenshot(path=str(out), full_page=False)
        print(f"OK pos -> {out} ({out.stat().st_size})")

        # 2. Pembayaran (uang pas)
        page.evaluate("() => { try { window.KasirApp.openPaymentModal(); } catch(e){} }")
        page.wait_for_timeout(900)
        page.evaluate("() => { try { window.KasirApp.selectQuickCash('exact'); } catch(e){} }")
        page.wait_for_timeout(600)
        page.evaluate(CLEAN_JS)
        out = OUT / "screenshot-checkout.png"
        page.screenshot(path=str(out), full_page=False)
        print(f"OK checkout -> {out} ({out.stat().st_size})")
        page.evaluate("() => { try { window.KasirApp.closePaymentModal(); } catch(e){} }")
        page.wait_for_timeout(400)

        # 3. Printer
        page.evaluate("() => { try { window.KasirApp.openPrinterConfigModal(); } catch(e){} }")
        page.wait_for_timeout(1100)
        page.evaluate(CLEAN_JS)
        out = OUT / "screenshot-printer.png"
        page.screenshot(path=str(out), full_page=False)
        print(f"OK printer -> {out} ({out.stat().st_size})")
        page.evaluate("() => { try { window.KasirApp.closePrinterConfigModal(); } catch(e){} }")
        page.wait_for_timeout(400)

        # 4. Laporan
        page.evaluate("() => { try { window.KasirApp.switchView('report'); } catch(e){} window.scrollTo(0,0); }")
        page.wait_for_timeout(1200)
        page.evaluate(CLEAN_JS)
        out = OUT / "screenshot-report.png"
        page.screenshot(path=str(out), full_page=False)
        print(f"OK report -> {out} ({out.stat().st_size})")

        # 5. Kelola menu
        page.evaluate("() => { try { window.KasirApp.switchView('admin'); } catch(e){} window.scrollTo(0,0); }")
        page.wait_for_timeout(1100)
        page.evaluate(CLEAN_JS)
        out = OUT / "screenshot-admin.png"
        page.screenshot(path=str(out), full_page=False)
        print(f"OK admin -> {out} ({out.stat().st_size})")

        # bersihkan kembali keranjang contoh agar tidak tertinggal di cloud demo
        page.evaluate(CLEANUP_JS)
        page.wait_for_timeout(800)
        browser.close()
    print("Selesai.")

if __name__ == "__main__":
    main()
