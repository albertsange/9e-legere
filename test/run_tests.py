"""Browser tests for the members' site, against the in-memory Supabase stand-in (test/mock-supabase.js)."""
import json, os, sys, threading, http.server, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.environ.get("ROOT9E", "/home/claude/web9e")
SHOTS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/shots"
os.makedirs(SHOTS, exist_ok=True)
PORT = 8765

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Quiet(handler.func):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()

seed = open(os.environ.get("SEED9E", f"{ROOT}/seed.json"), encoding="utf-8").read()
mock = open(f"{ROOT}/test/mock-supabase.js", encoding="utf-8").read()
SUPA = "window.__SEED = " + seed + ";\n" + mock

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("dialog", lambda d: d.accept())
    ctx.route("**/config.js", lambda r: r.fulfill(body="window.APP_CONFIG={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'x'};", content_type="text/javascript"))
    ctx.route("https://cdn.jsdelivr.net/**", lambda r: r.fulfill(body=SUPA, content_type="text/javascript"))
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    ctx.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    base = f"http://127.0.0.1:{PORT}/site/index.html"

    def S(expr): return page.evaluate(expr)
    def wait(ms=250): page.wait_for_timeout(ms)
    def login(email, pw):
        page.click("#acct [data-act=login]"); wait(100)
        page.fill("#f-login [name=email]", email); page.fill("#f-login [name=password]", pw)
        page.click("#f-login button[type=submit]"); wait(500)
    def logout():
        page.click(".acct-menu summary"); page.click(".acct-pop [data-act=logout]"); wait(400)

    # 1 anonymous visitor -------------------------------------------------
    page.goto(base); wait(600)
    check("English is the default language", S("document.documentElement.lang") == "en" and page.input_value("#lang-select") == "en" and "Search" in (page.get_attribute("#q", "placeholder") or ""))
    page.select_option("#lang-select", "ca"); wait(300)
    check("home renders the 9 main items", page.locator(".hlist > li").count() == 9, page.locator(".hlist > li").count())
    check("home and menu have no numbers or badges", page.locator(".hlist .num, .hlist .chip, #menu-body .dot, #menu-body .legend").count() == 0)
    check("side menu lists all 17 pages", page.locator("#menu-body .menu-items a").count() == 17)
    check("login button shown when logged out", page.locator("#acct [data-act=login]").count() == 1)
    page.screenshot(path=f"{SHOTS}/01_home_anon.png")
    page.goto(base + "#shako"); wait(400)
    check("item page renders title", "shako" in page.locator(".wiki-head h2").inner_text().lower())
    check("three tabs locked for anonymous", page.locator(".tab-locked").count() == 3)
    check("no members-only data loaded", S("Object.keys(window.__app.S.priv).length") == 0)
    page.click("#shako-tab-reg"); wait(100)
    check("locked panel with login button", page.locator("#shako-panel-reg .locked [data-act=login]").count() == 1)
    check("regulation text absent from DOM", "Règlement" not in page.content() and "Décret" not in page.content())
    page.screenshot(path=f"{SHOTS}/02_locked.png")
    check("standard shown after the description, with no tab", page.locator(".std-hero").count() == 1 and page.locator("#shako-tab-std").count() == 0)
    check("no missing-data tab, no numbers, no badges", page.locator("#shako-tab-gaps").count() == 0 and page.locator(".piece-head .num, .chip, .wiki-sub").count() == 0)
    check("first tab is called Informació", page.locator("#shako-tab-parts").inner_text().startswith("Informació"))
    page.locator(".std-hero .ref").first.dispatch_event("click"); wait(100)
    check("ref click while locked opens the locked regulations tab", page.locator("#shako-tab-reg").get_attribute("aria-selected") == "true")
    check("autolinks present in text", page.locator(".wiki-body a.wl").count() > 0)
    page.click("#shako-panel-reg [data-act=login]"); wait(100)
    check("login dialog opens from locked tab", page.locator("#login-dlg[open]").count() == 1)
    page.fill("#f-login [name=email]", "member@test.org"); page.fill("#f-login [name=password]", "wrong")
    page.click("#f-login button[type=submit]"); wait(300)
    check("wrong password shows error", "incorrect" in page.locator("#f-login .form-msg").inner_text().lower())
    page.click("#f-login [data-act=close-dlg]")

    # 2 pending member ------------------------------------------------------
    login("pending@test.org", "pendingpass1")
    page.goto(base + "#shako"); wait(400)
    page.click("#shako-tab-reg"); wait(100)
    check("pending member still locked", page.locator(".tab-locked").count() == 3)
    check("pending message shown", "aprovació" in page.locator("#shako-panel-reg .locked").inner_text())
    logout()

    # 3 approved member ------------------------------------------------------
    login("member@test.org", "memberpass1")
    check("account menu shows nom de guerre", "Sans-Souci" in page.locator("#acct").inner_text())
    check("member has no edit button", page.locator("[data-act=toggle-edit]").count() == 0)
    page.goto(base + "#shako"); wait(400)
    check("member tabs unlocked", page.locator(".tab-locked").count() == 0)
    page.click("#shako-tab-reg"); wait(100)
    check("regulations visible", page.locator("#shako-panel-reg details.reg").count() == 4, page.locator("#shako-panel-reg details.reg").count())
    page.click("#shako-tab-evid"); wait(500)
    src = page.locator("#shako-panel-evid .gallery img").first.get_attribute("src") or ""
    check("evidence gallery loads images through signed links", "hersent49" in src, src)
    page.locator("#shako-panel-evid .gal-open").first.click(); wait(400)
    check("photo opens in the viewer", page.locator("dialog.lightbox[open] img").count() == 1 and "hersent49" in (page.locator("dialog.lightbox img").get_attribute("src") or ""))
    page.keyboard.press("Escape"); wait(150)
    page.screenshot(path=f"{SHOTS}/03_member_evid.png")
    page.locator(".std-hero .ref").first.dispatch_event("click"); wait(300)
    check("ref opens regulation row", page.locator("#shako-panel-reg details.reg[open]").count() >= 1)
    page.select_option("#lang-select", "en"); wait(300)
    check("language switch re-renders in English", page.locator(".wiki-head h2").inner_text().strip() != "" and page.locator("#shako-tab-reg").inner_text().startswith("Regulations"))
    page.select_option("#lang-select", "ca"); wait(200)
    page.fill("#q", "armilla"); wait(300)
    first = page.locator("#s-results .s-item").first
    check("search finds a piece from a word in another language (armilla → veste)", first.get_attribute("href") == "#veste", first.get_attribute("href"))
    check("search lists only pieces, no text snippets", page.locator("#s-results .s-item").count() <= 8 and page.locator("#s-results mark").count() == 0)
    page.press("#q", "Enter"); wait(300)
    check("Enter opens the piece page", page.url.endswith("#veste"))
    page.fill("#q", "sabre"); wait(300)
    check("search by synonym (sabre → briquet)", page.locator("#s-results .s-item").first.get_attribute("href") == "#briquet")
    page.fill("#q", "shakko"); wait(300)
    check("misspelling shows suggestions", "potser" in page.locator("#s-results .s-group").first.inner_text().lower() and page.locator('#s-results a[href="#shako"]').count() == 1)
    page.fill("#q", "zzqqxx"); wait(300)
    check("no match offers the list of pieces", page.locator("#s-results .s-item").count() == 17)
    page.locator('#s-results a[href="#col"]').dispatch_event("mousedown"); wait(300)
    check("clicking a suggestion opens the page", page.url.endswith("#col"))
    page.goto(base + "#gestio"); wait(300)
    check("member cannot open administration", page.locator("#members").count() == 0)
    page.goto(base + "#compte"); wait(300)
    page.fill("#f-profile [name=nom_guerre]", "Bon-Courage"); page.click("#f-profile button[type=submit]"); wait(400)
    check("member edits own profile", S("window.__DB.profiles.find(p=>p.id==='u-member').nom_guerre") == "Bon-Courage")
    check("member cannot self-promote via API", S("""(async()=>{const c=window.supabase.createClient();await c.from('profiles').update({role:'admin'}).eq('id','u-member');return window.__DB.profiles.find(p=>p.id==='u-member').role})()""") == "member")
    check("member cannot write pages via API", S("""(async()=>{const c=window.supabase.createClient();await c.from('pages').update({name:'X'}).eq('id','shako');return window.__DB.pages.find(p=>p.id==='shako').name})()""") == "Shako")
    logout()
    check("logout hides private data", S("Object.keys(window.__app.S.priv).length") == 0)

    # 4 registration ----------------------------------------------------------
    page.goto(base + "#registre"); wait(300)
    f = "#f-register "
    page.fill(f + "[name=email]", "nou@test.org"); page.fill(f + "[name=password]", "abcdefgh1"); page.fill(f + "[name=password2]", "abcdefgh2")
    page.fill(f + "[name=first_name]", "Joan"); page.fill(f + "[name=last_name]", "Puig i Roca"); page.fill(f + "[name=nom_guerre]", "La Rosée")
    page.select_option(f + "[name=esquadra]", "Esquadra B")
    page.click(f + "button[type=submit]"); wait(200)
    check("password mismatch rejected", "coincideixen" in page.locator(f + ".form-msg").inner_text())
    page.fill(f + "[name=password2]", "abcdefgh1"); page.click(f + "button[type=submit]"); wait(300)
    su = S("window.__LAST_SIGNUP")
    check("sign-up sends all fields", su and su["options"]["data"] == {"first_name": "Joan", "last_name": "Puig i Roca", "nom_guerre": "La Rosée", "esquadra": "Esquadra B", "lang": "ca"}, su)
    page.screenshot(path=f"{SHOTS}/04_register.png")

    # 5 administrator ------------------------------------------------------------
    page.goto(base + "#shako"); wait(300)
    login("admin@test.org", "adminpass1")
    check("admin sees edit button", page.locator("[data-act=toggle-edit]").count() == 1)
    page.click("[data-act=toggle-edit]"); wait(300)
    check("edit bar visible", page.locator("#editbar").is_visible())
    check("page settings visible", page.locator(".settings").count() == 1)
    lead = page.locator('[data-path="page.content.lead.ca"]')
    lead.click(); page.keyboard.press("End"); page.keyboard.type(" PROVA-EDICIO")
    page.click('[data-act=add][data-list="page.content.desc.ca"]'); wait(200)
    check("lead edit survives adding a paragraph", "PROVA-EDICIO" in page.locator('[data-path="page.content.lead.ca"]').inner_text())
    n = page.locator('[data-path^="page.content.desc.ca."]').count()
    page.locator(f'[data-path="page.content.desc.ca.{n-1}"]').click(); page.keyboard.type("Paràgraf nou de prova.")
    page.click("#shako-tab-reg"); wait(100)
    page.click('[data-act=add][data-list="priv.regs"]'); wait(200)
    k = S("window.__app.S.draft.priv.regs.length") - 1
    page.locator(f'[data-path="priv.regs.{k}.year"]').click(); page.keyboard.type("1810")
    page.locator(f'[data-path="priv.regs.{k}.name"]').click(); page.keyboard.type("Règlement de prova")
    page.locator(f'[data-path="priv.regs.{k}.parts.0.fr"]').click(); page.keyboard.type("Texte français.")
    page.locator(f'[data-path="priv.regs.{k}.parts.0.tr.ca"]').click(); page.keyboard.type("Text català.")
    page.screenshot(path=f"{SHOTS}/05_edit_regs.png", full_page=False)
    page.click("#editbar [data-act=save]"); wait(600)
    sh = S("window.__DB.pages.find(p=>p.id==='shako')")
    check("lead saved", "PROVA-EDICIO" in sh["content"]["lead"]["ca"])
    check("new paragraph saved", sh["content"]["desc"]["ca"][-1] == "Paràgraf nou de prova.", sh["content"]["desc"]["ca"][-1])
    pr = S("window.__DB.page_private.find(p=>p.page_id==='shako').content")
    check("new regulation saved", pr["regs"][-1]["year"] == "1810" and pr["regs"][-1]["parts"][0]["tr"]["ca"] == "Text català.", pr["regs"][-1])
    check("edited text translated into the other languages", sh["content"]["lead"]["en"].startswith("[en] ") and "PROVA-EDICIO" in sh["content"]["lead"]["en"] and sh["content"]["lead"]["de"].startswith("[de] "))
    check("regulation translation not written into French", "fr" not in pr["regs"][-1]["parts"][0]["tr"] and pr["regs"][-1]["parts"][0]["tr"]["en"] == "[en] Text català.")
    check("back to read mode after save", page.locator("#editbar").is_hidden() and page.locator(".ed").count() == 0)

    # evidence groups: add a group, upload photos, caption, move, save
    page.goto(base + "#shako"); wait(300)
    page.click("[data-act=toggle-edit]"); wait(300)
    page.click("#shako-tab-evid"); wait(100)
    check("old photos migrated into one group", S("window.__app.S.draft.priv.groups.length") == 1 and S("window.__app.S.draft.priv.groups[0].figs.length") == 1)
    page.click('[data-act=add][data-list="priv.groups"]'); wait(200)
    page.locator('[data-path="priv.groups.1.title.ca"]').click(); page.keyboard.type("Shako model 1806")
    with page.expect_file_chooser() as fc:
        page.locator('[data-act=add-photos][data-g="1"]').click()
    fc.value.set_files([f"{ROOT}/img/card_shako.jpg", f"{ROOT}/img/det_shako.jpg"]); wait(1500)
    check("two photos uploaded with thumbnails", S("window.__app.S.draft.priv.groups[1].figs.filter(f => f.thumb && f.thumb.endsWith('.thumb.jpg')).length") == 2, S("JSON.stringify(window.__app.S.draft.priv.groups[1].figs)"))
    page.locator('[data-path="priv.groups.1.figs.0.cap.ca"]').click(); page.keyboard.type("Vista frontal")
    page.locator('.gal-move').first.select_option("1"); wait(200)
    check("photo moved to the other group", S("window.__app.S.draft.priv.groups[0].figs.length") == 0 and S("window.__app.S.draft.priv.groups[1].figs.length") == 3)
    page.click("#editbar [data-act=save]"); wait(700)
    g = S("window.__DB.page_private.find(p=>p.page_id==='shako').content")
    check("groups saved, flat list gone", "figs" not in g and g["groups"][1]["title"]["ca"] == "Shako model 1806" and len(g["groups"][1]["figs"]) == 3)
    check("caption saved", any(f["cap"].get("ca") == "Vista frontal" for f in g["groups"][1]["figs"]))
    check("shared old image not deleted from storage", "evid/hersent49.jpg" not in (S("window.__REMOVED || []") or []))
    page.click("#shako-tab-evid"); wait(500)
    check("gallery shows the new group heading", "Shako model 1806" in page.locator("#shako-panel-evid").inner_text())
    page.screenshot(path=f"{SHOTS}/09_gallery.png", full_page=False)

    # new page
    page.goto(base + "#nova"); wait(300)
    page.fill("#f-newpage [name=pname]", "Havresac de prova")
    check("identifier suggested from name", page.input_value("#f-newpage [name=pid]") == "havresac-de-prova")
    page.select_option("#f-newpage [name=parent]", "giberne")
    page.click("#f-newpage button[type=submit]"); wait(700)
    check("new page created and opened in edit mode", "havresac-de-prova" in page.url and page.locator(".settings").count() == 1)
    check("new page placed under Giberne", page.locator(".rel").inner_text().find("Giberne") > -1)
    page.locator('[data-path="page.content.lead.ca"]').click(); page.keyboard.type("Motxilla de pell.")
    page.click("#editbar [data-act=save]"); wait(600)
    check("new page content saved", S("window.__DB.pages.find(p=>p.id==='havresac-de-prova').content.lead.ca") == "Motxilla de pell.")
    check("new page appears in menu", page.locator('#menu-body a[data-sec="havresac-de-prova"]').count() == 1)
    page.screenshot(path=f"{SHOTS}/06_new_page.png")

    # editing in another language: the change is saved and translated into the rest
    check("new page title translated at creation", S("window.__DB.pages.find(p=>p.id==='havresac-de-prova').content.h2.en") == "[en] Havresac de prova")
    check("new page text translated on save", S("window.__DB.pages.find(p=>p.id==='havresac-de-prova').content.lead.it") == "[it] Motxilla de pell.")
    page.select_option("#lang-select", "it"); wait(200)
    page.click("[data-act=toggle-edit]"); wait(300)
    page.locator('[data-path="page.content.h2.it"]').click(); page.keyboard.press("Control+A"); page.keyboard.type("Zaino di prova")
    calls = S("window.__TRANSLATE_CALLS")
    page.click("#editbar [data-act=save]"); wait(600)
    pp = S("window.__DB.pages.find(p=>p.id==='havresac-de-prova').content")
    check("Italian title saved and translated into Catalan", pp["h2"].get("it") == "Zaino di prova" and pp["h2"].get("ca") == "[ca] Zaino di prova", pp["h2"])
    check("one translation call per save", S("window.__TRANSLATE_CALLS") == calls + 1)
    page.select_option("#lang-select", "ca"); wait(200)

    # home and decisions are editable
    page.goto(base + "#decisions"); wait(300)
    page.click("[data-act=toggle-edit]"); wait(300)
    check("decisions block editable", page.locator('[data-path="site.decisions.html.ca"]').count() == 1)
    page.click("[data-act=addrow]")
    page.click("#editbar [data-act=save]"); wait(500)
    rows_before = len(json.loads(seed)["site"]["decisions"]["html"]["ca"].split("<tr>"))
    rows_after = len(S("window.__DB.site.find(s=>s.key==='decisions').value.html.ca").split("<tr>"))
    check("table row added and saved", rows_after == rows_before + 1, (rows_before, rows_after))

    # delete the test page
    page.goto(base + "#havresac-de-prova"); wait(300)
    page.click("[data-act=toggle-edit]"); wait(300)
    page.click("[data-act=delete-page]"); wait(700)
    check("page deleted", S("window.__DB.pages.some(p=>p.id==='havresac-de-prova')") is False)

    # administration
    page.goto(base + "#gestio"); wait(600)
    check("members listed", page.locator("#members tbody tr").count() >= 3, page.locator("#members tbody tr").count())
    check("storage usage shown", "MB" in page.locator("#storage-usage").inner_text())
    row = page.locator('#members tr', has_text="pending@test.org")
    row.locator("[name=status]").select_option("approved"); row.locator("[data-act=save-member]").click(); wait(300)
    check("admin approves member", S("window.__DB.profiles.find(p=>p.id==='u-pending').status") == "approved")
    page.fill("#f-squad [name=name]", "Esquadra C"); page.click("#f-squad button[type=submit]"); wait(400)
    check("squad added", S("window.__DB.squads.some(s=>s.name==='Esquadra C')"))
    page.screenshot(path=f"{SHOTS}/07_admin.png", full_page=True)

    # mobile layout
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(base + "#shako"); wait(400)
    check("no horizontal scroll on phone", S("document.documentElement.scrollWidth <= window.innerWidth + 1"), S("document.documentElement.scrollWidth"))
    page.screenshot(path=f"{SHOTS}/08_mobile.png")

    real_errors = [e for e in errors if "net::ERR_FAILED" not in e and "Failed to load resource" not in e]
    check("no script errors", not real_errors, real_errors[:5])
    b.close()

srv.shutdown()
failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
