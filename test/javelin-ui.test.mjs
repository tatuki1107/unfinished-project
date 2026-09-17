import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, readdir, stat } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { indexedDB } from "fake-indexeddb";
import {
  Component, a, attr, button, castInt, checked, component, context, cssModule, div, each, form, href, input, internals, key, lazy, li, mount,
  fragment, formValid, guard, link, modal, navigate, newJavaArray, numericValue, onClick, onSubmit, option, p, parseJavaDouble, parseJavaInt, portal, prepareHmr,
  redirect, ref, required, route, routeGroup, router, select, span, spinner, src, tag, text, ul, value, when
} from "../src/runtime/runtime.mjs";
import { build, cliInternals, compileJava, createDevelopmentServer } from "../bin/javelin-ui.mjs";

function installDom() {
  const dom = new JSDOM("<!doctype html><div id='app'></div>", { url: "http://localhost" });
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  return dom;
}

async function waitUntil(predicate, timeout = 500) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for test condition");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

test("state updates patch text without replacing stable DOM nodes", async () => {
  installDom();
  class Counter extends Component {
    constructor() { super(); this.count = this.state(0); }
    render() {
      return div(p(text(`Count: ${this.count.get()}`)), button(onClick(() => this.count.update((n) => n + 1)), text("+1")));
    }
  }
  const handle = mount(Counter, "#app");
  const paragraph = document.querySelector("p");
  document.querySelector("button").click();
  await new Promise(queueMicrotask);
  assert.equal(document.querySelector("p"), paragraph);
  assert.equal(paragraph.textContent, "Count: 1");
  handle.unmount();
  assert.equal(document.querySelector("#app").childNodes.length, 0);
});

test("child props update and keyed nodes preserve identity during reorder", async () => {
  installDom();
  class Label extends Component { render() { return p(text(this.props.label)); } }
  class List extends Component {
    constructor() { super(); this.items = this.state([1, 2, 3]); }
    render() {
      return div(component(Label, { label: `size:${this.items.get().length}` }),
        ul(each(this.items.get(), (item) => li(key(item), text(item)))));
    }
  }
  const handle = mount(List, "#app");
  const original = new Map([...document.querySelectorAll("li")].map((node) => [node.textContent, node]));
  handle.instance.items.set([3, 1, 2]);
  await new Promise(queueMicrotask);
  assert.deepEqual([...document.querySelectorAll("li")].map((node) => node.textContent), ["3", "1", "2"]);
  for (const node of document.querySelectorAll("li")) assert.equal(node, original.get(node.textContent));
  assert.equal(document.querySelector("p").textContent, "size:3");
});

test("lifecycle, effect cleanup, and error fallback execute", async () => {
  installDom();
  const calls = [];
  class Lifecycle extends Component {
    constructor() { super(); this.flag = this.state(false); }
    mounted() { calls.push("mounted"); }
    unmounted() { calls.push("unmounted"); }
    render() {
      this.effect(() => { calls.push(`effect:${this.flag.get()}`); return () => calls.push("cleanup"); }, [this.flag.get()]);
      if (this.flag.get()) throw new Error("render failed");
      return text("ready");
    }
    fallback(error) { return text(error.message); }
  }
  const handle = mount(Lifecycle, "#app");
  assert.deepEqual(calls, ["mounted", "effect:false"]);
  handle.instance.flag.set(true);
  await new Promise(queueMicrotask);
  assert.equal(document.querySelector("#app").textContent, "render failed");
  assert.deepEqual(calls, ["mounted", "effect:false", "cleanup", "effect:true"]);
  handle.unmount();
  assert.deepEqual(calls, ["mounted", "effect:false", "cleanup", "effect:true", "cleanup", "unmounted"]);
});

test("form properties and URL safety are handled as DOM properties", () => {
  installDom();
  mount(class extends Component {
    render() { return div(input(value("abc"), checked(true)), a(href("/safe"), text("safe"))); }
  }, "#app");
  assert.equal(document.querySelector("input").value, "abc");
  assert.equal(document.querySelector("input").checked, true);
  assert.throws(() => href("javascript:alert(1)"), /Unsafe URL/);
  assert.throws(() => href("java\nscript:alert(1)"), /Unsafe/);
  assert.throws(() => href("data:text/html,<script>alert(1)<\/script>"), /Unsafe URL/);
  assert.throws(() => src("data:image/svg+xml,<svg onload=alert(1) />"), /Unsafe URL/);
  assert.doesNotThrow(() => src("data:image/png;base64,iVBORw0KGgo="));
});

test("event listeners are retained while handlers update", async () => {
  installDom();
  class Events extends Component {
    constructor() { super(); this.version = this.state(0); }
    render() { return button(onClick(() => this.version.set(this.version.get() + 1)), text(this.version.get())); }
  }
  const handle = mount(Events, "#app");
  const node = document.querySelector("button");
  let additions = 0;
  let removals = 0;
  const add = node.addEventListener.bind(node);
  const remove = node.removeEventListener.bind(node);
  node.addEventListener = (...args) => { additions++; return add(...args); };
  node.removeEventListener = (...args) => { removals++; return remove(...args); };
  node.click();
  await new Promise(queueMicrotask);
  node.click();
  await new Promise(queueMicrotask);
  assert.equal(node.textContent, "2");
  assert.equal(additions, 0);
  assert.equal(removals, 0);
  handle.unmount();
  assert.equal(removals, 1);
});

test("router renders parameters and link navigation", async () => {
  installDom();
  history.replaceState({}, "", "/users/42");
  class Routed extends Component {
    render() {
      return div(
        router(route("/", () => text("home")), route("/users/:id", (params) => text(`user:${params.get("id")}`))),
        link("/", text("go home"))
      );
    }
  }
  mount(Routed, "#app");
  assert.match(document.querySelector("#app").textContent, /user:42/);
  document.querySelector("a").click();
  await new Promise(queueMicrotask);
  assert.equal(location.pathname, "/");
  assert.match(document.querySelector("#app").textContent, /home/);
});

test("duplicate list keys fail visibly instead of corrupting DOM", () => {
  installDom();
  const parent = document.createElement("ul");
  const previous = [li(key(1), text("1"))];
  parent.append(internals.createDom(previous[0], null));
  const next = [li(key(1), text("first")), li(key(1), text("second"))];
  assert.throws(() => internals.reconcileChildren(parent, previous, next, null), /Duplicate child key/);
});

test("child root replacements stay synchronized across state and parent prop updates", async () => {
  installDom();
  class Child extends Component {
    constructor(props) { super(props); this.swap = this.state(false); }
    render() { return this.swap.get() && !this.props.back ? p(text("child")) : div(text("child")); }
  }
  const oldVNode = component(Child, { back: false });
  const container = document.querySelector("#app");
  container.append(internals.createDom(oldVNode, null));
  oldVNode._instance._mounted = true;
  oldVNode._instance.swap.set(true);
  await new Promise(queueMicrotask);
  const nextVNode = component(Child, { back: true });
  assert.doesNotThrow(() => internals.patchNode(container, oldVNode, nextVNode, null));
  assert.equal(container.firstElementChild.tagName, "DIV");
});

test("replacing the child at the reconciliation cursor keeps DOM ordering valid", async () => {
  installDom();
  class ConditionalChild extends Component {
    constructor() { super(); this.sent = this.state(false); }
    render() {
      return div(span(text("before")), when(this.sent.get(), () => p(text("done")), () => form(input())), span(text("after")));
    }
  }
  const handle = mount(ConditionalChild, "#app");
  handle.instance.sent.set(true);
  await new Promise(queueMicrotask);
  assert.deepEqual([...document.querySelector("#app > div").children].map((node) => node.textContent), ["before", "done", "after"]);
});

test("refs are released and remounting disposes the previous root", () => {
  installDom();
  const refs = [];
  let unmounts = 0;
  class First extends Component {
    unmounted() { unmounts++; }
    render() { return div(ref((node) => refs.push(node))); }
  }
  class Second extends Component { render() { return p(text("second")); } }
  mount(First, "#app");
  mount(Second, "#app");
  assert.equal(unmounts, 1);
  assert.ok(refs[0]);
  assert.equal(refs.at(-1), null);
});

test("build helpers reject dangerous output paths and support flexible HTML attributes", () => {
  assert.throws(() => cliInternals.assertSafeOutputDirectory({
    sourceDirectory: "src/main/java", publicDirectory: "public", entryHtml: "index.html", tailwindInput: "styles/app.css",
    outputDirectory: "."
  }, process.cwd()), /Unsafe outputDirectory/);
  const html = `<link href='/@javelin/styles.css' rel='stylesheet'><script src='/@javelin/app.mjs' defer type='module'></script>`;
  const generated = cliInternals.injectProductionAssets(html, "/base/assets/app.js", "/base/assets/app.css");
  assert.match(generated, /src="\/base\/assets\/app\.js"/);
  assert.match(generated, /href="\/base\/assets\/app\.css"/);
});

test("CSS Modules generate deterministic scoped class names", () => {
  const expected = cliInternals.moduleClassName("styles/counter.module.css", "panel");
  const transformed = cliInternals.transformCssModule(".panel { color: red; }", "styles/counter.module.css");
  assert.match(transformed, new RegExp(`\\.${expected}`));
  installDom();
  mount(class extends Component { render() { return div(cssModule("styles/counter.module.css", "panel")); } }, "#app");
  assert.equal(document.querySelector("#app > div").className, expected);
});

test("fragments add no wrapper element, support array roots, and preserve SVG namespaces", () => {
  installDom();
  class FragmentRoot extends Component {
    render() { return fragment(div(text("first")), p(text("second"))); }
  }
  const handle = mount(FragmentRoot, "#app");
  assert.deepEqual([...document.querySelector("#app").children].map((node) => node.tagName), ["DIV", "P"]);
  handle.unmount();
  class ArrayRoot extends Component { render() { return [div(text("array")), tag("svg", tag("circle"))]; } }
  mount(ArrayRoot, "#app");
  assert.deepEqual([...document.querySelector("#app").children].map((node) => node.tagName), ["DIV", "svg"]);
  assert.equal(document.querySelector("circle").namespaceURI, "http://www.w3.org/2000/svg");
});

test("render-time lifecycle registration does not accumulate", async () => {
  installDom();
  let unmounts = 0;
  class LifecycleRegistration extends Component {
    constructor() { super(); this.count = this.state(0); }
    render() { this.onUnmount(() => unmounts++); return text(this.count.get()); }
  }
  const handle = mount(LifecycleRegistration, "#app");
  handle.instance.count.set(1);
  await new Promise(queueMicrotask);
  handle.unmount();
  assert.equal(unmounts, 1);
});

test("AST compiler recognizes qualified Component and rejects overloads explicitly", async () => {
  const qualified = await compileJava({ sourceDirectory: "test/fixtures/qualified", apiSourceDirectory: "src/main/java/javelin/ui" }, "./runtime.mjs");
  assert.match(qualified, /static label\(\)/);
  assert.match(qualified, /QualifiedApp\.label\(\)/);
  assert.match(qualified, /new Map/);
  assert.match(qualified, /"a" === "a"/);
  await assert.rejects(
    compileJava({ sourceDirectory: "test/fixtures/overload", apiSourceDirectory: "src/main/java/javelin/ui" }, "./runtime.mjs"),
    /Method overloading is not supported yet/
  );
});

test("context flows through DOM layers and form APIs use DOM properties", () => {
  installDom();
  const Theme = context("light");
  let submitted = false;
  class Child extends Component { render() { return p(text(this.useContext(Theme))); } }
  class Parent extends Component {
    render() {
      this.provideContext(Theme, "dark");
      return div(component(Child, {}), form(onSubmit((event) => { event.preventDefault(); submitted = true; }),
        input(required(true)), select(option(value("a"), text("A")))));
    }
  }
  mount(Parent, "#app");
  assert.equal(document.querySelector("p").textContent, "dark");
  assert.equal(document.querySelector("input").required, true);
  document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(submitted, true);
});

test("context and component children update even when shouldUpdate rejects prop-only updates", async () => {
  installDom();
  const Theme = context("light");
  class Child extends Component {
    shouldUpdate() { return false; }
    render() { return div(text(this.useContext(Theme)), ...this.children()); }
  }
  class Parent extends Component {
    constructor() { super(); this.dark = this.state(false); }
    render() {
      this.provideContext(Theme, this.dark.get() ? "dark" : "light");
      return component(Child, {}, text(this.dark.get() ? " child-2" : " child-1"));
    }
  }
  const handle = mount(Parent, "#app");
  assert.equal(document.querySelector("#app").textContent, "light child-1");
  handle.instance.dark.set(true);
  await new Promise(queueMicrotask);
  assert.equal(document.querySelector("#app").textContent, "dark child-2");
});

test("SVG attributes are explicit and malformed route encodings fall through safely", () => {
  installDom();
  mount(class extends Component { render() { return tag("svg", tag("circle", attr("viewBox", "0 0 10 10"), attr("cx", 5))); } }, "#app");
  assert.equal(document.querySelector("circle").getAttribute("cx"), "5");
  assert.throws(() => attr("onclick", "alert(1)"), /Unsafe attribute/);
  assert.throws(() => attr("xlink:href", "java\tscript:alert(1)"), /Unsafe/);
  assert.throws(() => attr("srcdoc", "<script>alert(1)<\/script>"), /Unsafe attribute/);
  history.replaceState({}, "", "/users/%E0%A4%A");
  assert.doesNotThrow(() => router(route("/users/:id", (params) => text(params.get("id"))), route("*", () => text("fallback"))));
});

test("router exposes query and hash and catch-all routes", () => {
  installDom();
  history.replaceState({}, "", "/unknown?q=search#section");
  class Routed extends Component {
    render() { return router(route("/known", () => text("known")), route("*", (params) => text(`${params.query("q")}:${params.hash()}`))); }
  }
  mount(Routed, "#app");
  assert.equal(document.querySelector("#app").textContent, "search:section");
});

test("nested router groups apply layouts, catch-alls, guards, and redirects", async () => {
  installDom();
  history.replaceState({}, "", "/admin/missing");
  class Routed extends Component {
    render() {
      return router(routeGroup("/admin", (page) => div(attr("data-layout", "admin"), page),
        route("/users/:id", (params) => text(`user:${params.get("id")}`)),
        route("*", () => text("admin fallback"))));
    }
  }
  mount(Routed, "#app");
  assert.equal(document.querySelector("[data-layout=admin]").textContent, "admin fallback");
  history.replaceState({}, "", "/private");
  assert.doesNotThrow(() => router(guard(() => false, "/login", route("/private", () => text("secret")))));
  await new Promise(queueMicrotask);
  assert.equal(location.pathname, "/login");
  history.replaceState({}, "", "/old");
  router(redirect("/old", "/new"));
  await new Promise(queueMicrotask);
  assert.equal(location.pathname, "/new");
});

test("resources manage loading, JSON decoding, cache, mutation, and cancellation", async () => {
  installDom();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal(options.credentials, "same-origin");
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ name: "Ada", age: 37 }) };
  };
  try {
    class Remote extends Component {
      constructor() { super(); this.user = this.resource("/api/user", (json) => json.string("name")); }
      render() { return text(this.user.loading() ? "loading" : this.user.hasValue() ? this.user.get() : this.user.errorMessage()); }
    }
    const first = mount(Remote, "#app");
    assert.equal(document.querySelector("#app").textContent, "loading");
    await waitUntil(() => document.querySelector("#app").textContent === "Ada");
    assert.equal(document.querySelector("#app").textContent, "Ada");
    first.instance.user.mutate("Grace");
    await new Promise(queueMicrotask);
    assert.equal(document.querySelector("#app").textContent, "Grace");
    first.unmount();
    const second = mount(Remote, "#app");
    await new Promise(queueMicrotask);
    assert.equal(document.querySelector("#app").textContent, "Ada");
    assert.equal(calls, 1);
    second.unmount();
    class Age extends Component {
      constructor() { super(); this.age = this.resource("/api/user", (json) => json.integer("age")); }
      render() { return text(this.age.hasValue() ? this.age.get() : "loading"); }
    }
    const third = mount(Age, "#app");
    await new Promise(queueMicrotask);
    assert.equal(document.querySelector("#app").textContent, "37");
    assert.equal(calls, 1);
    third.unmount();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resource policies retry, timeout, stale cache, and cache expiry", async () => {
  installDom();
  internals.clearResourceCache();
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    if (attempts < 3) throw new TypeError("temporary network failure");
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ value: "ready" }) };
  };
  try {
    class Retrying extends Component {
      constructor() {
        super();
        const options = this.resourceOptions().retry(2).retryDelay(0).timeout(1000).staleTime(1000).cacheTime(2000);
        this.data = this.resource("/api/retry", (json) => json.string("value"), options);
      }
      render() { return text(this.data.hasValue() ? this.data.get() : this.data.errorMessage() ?? "loading"); }
    }
    const first = mount(Retrying, "#app");
    await waitUntil(() => document.querySelector("#app").textContent === "ready");
    assert.equal(document.querySelector("#app").textContent, "ready");
    assert.equal(attempts, 3);
    first.unmount();
    const cached = mount(Retrying, "#app");
    await waitUntil(() => document.querySelector("#app").textContent === "ready");
    assert.equal(attempts, 3);
    cached.unmount();

    await new Promise((resolve) => setTimeout(resolve, 2));
    globalThis.fetch = async () => {
      attempts++;
      return { ok: true, status: 200, statusText: "OK", json: async () => ({ value: "revalidated" }) };
    };
    class Stale extends Component {
      constructor() {
        super();
        this.data = this.resource("/api/retry", (json) => json.string("value"), this.resourceOptions().staleTime(0).cacheTime(2000));
      }
      render() { return text(this.data.hasValue() ? this.data.get() : "loading"); }
    }
    const stale = mount(Stale, "#app");
    await waitUntil(() => document.querySelector("#app").textContent === "revalidated");
    assert.equal(attempts, 4);
    stale.unmount();

    globalThis.fetch = (_url, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => {
      const error = new Error("aborted"); error.name = "AbortError"; reject(error);
    }));
    class TimedOut extends Component {
      constructor() { super(); this.data = this.resource("/api/slow", (json) => json.raw(), this.resourceOptions().timeout(5)); }
      render() { return text(this.data.errorMessage() ?? "waiting"); }
    }
    const timed = mount(TimedOut, "#app");
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.match(document.querySelector("#app").textContent, /timed out after 5ms/);
    timed.unmount();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("persistent resources render offline data and revalidate when connectivity returns", async () => {
  const dom = installDom();
  internals.clearResourceCache();
  const originals = {
    fetch: globalThis.fetch, indexedDB: globalThis.indexedDB, navigator: globalThis.navigator,
    addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener
  };
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
  let online = true;
  Object.defineProperty(globalThis.navigator, "onLine", { get: () => online, configurable: true });
  let calls = 0;
  let serverValue = "stored";
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ value: serverValue }) };
  };
  class Persistent extends Component {
    constructor() {
      super();
      const options = this.resourceOptions().persistent("offline-test").staleTime(0).cacheTime(60_000).revalidateOnReconnect(true);
      this.data = this.resource("/api/persistent", (json) => json.string("value"), options);
    }
    render() { return text(this.data.hasValue() ? this.data.get() : this.data.errorMessage() ?? "loading"); }
  }
  try {
    const first = mount(Persistent, "#app");
    await waitUntil(() => document.querySelector("#app").textContent === "stored");
    assert.equal(document.querySelector("#app").textContent, "stored");
    first.unmount();
    internals.clearResourceCache();
    online = false;
    serverValue = "fresh";
    const offline = mount(Persistent, "#app");
    await waitUntil(() => document.querySelector("#app").textContent === "stored");
    assert.equal(document.querySelector("#app").textContent, "stored");
    assert.equal(calls, 1);
    online = true;
    dom.window.dispatchEvent(new dom.window.Event("online"));
    await waitUntil(() => document.querySelector("#app").textContent === "fresh");
    assert.equal(document.querySelector("#app").textContent, "fresh");
    assert.equal(calls, 2);
    offline.unmount();
  } finally {
    globalThis.fetch = originals.fetch;
    Object.defineProperty(globalThis, "indexedDB", { value: originals.indexedDB, configurable: true, writable: true });
    Object.defineProperty(globalThis, "navigator", { value: originals.navigator, configurable: true, writable: true });
    globalThis.addEventListener = originals.addEventListener;
    globalThis.removeEventListener = originals.removeEventListener;
  }
});

test("form fields validate touched state and UI primitives render accessible markup", async () => {
  installDom();
  class FormView extends Component {
    constructor() { super(); this.email = this.field("", (current) => current.includes("@") ? null : "invalid email"); }
    render() { return div(input(this.email.input()), text(this.email.error()), text(formValid(this.email)), spinner("Saving"), modal(true, "Confirm", p(text("Proceed?")))); }
  }
  const handle = mount(FormView, "#app");
  const field = document.querySelector("#app input");
  field.value = "person@example.com";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(queueMicrotask);
  assert.equal(handle.instance.email.valid(), true);
  assert.equal(document.querySelector('[role="status"]').getAttribute("aria-label"), "Saving");
  assert.equal(document.querySelector('[role="dialog"]').getAttribute("aria-modal"), "true");
  assert.equal(document.querySelector('[role="dialog"]').textContent, "Proceed?");
});

test("AST compiler fails closed for Java constructs with different JavaScript semantics", async () => {
  for (const [fixture, message] of [
    ["compound-int", /Compound assignment/],
    ["dynamic-css-module", /cssModule requires literal/],
    ["custom-record", /Custom record constructors and methods/]
  ]) {
    await assert.rejects(
      compileJava({ sourceDirectory: `test/fixtures/semantics/${fixture}`, apiSourceDirectory: "src/main/java/javelin/ui" }, "./runtime.mjs"),
      message
    );
  }
});

test("AST compiler lowers arrays, character arithmetic, numeric parsing, casts, and indirect inheritance", async () => {
  for (const [fixture, pattern] of [
    ["new-array", /newJavaArray\(3, 0\)/],
    ["char-arithmetic", /numericValue\("a"\)/],
    ["numeric-parse", /parseJavaInt\("12"\)/],
    ["casts", /castInt\(2\.9\)/],
    ["inheritance", /class DerivedApp extends BaseView/],
    ["lazy", /lazy\(\(\) => import\("\.\/lazy-page\.mjs"\)/]
  ]) {
    const output = await compileJava({ sourceDirectory: `test/fixtures/semantics/${fixture}`, apiSourceDirectory: "src/main/java/javelin/ui" }, "./runtime.mjs");
    assert.match(output, pattern);
  }
  const lazyOutput = await compileJava({ sourceDirectory: "test/fixtures/semantics/lazy-annotation", apiSourceDirectory: "src/main/java/javelin/ui" }, "./runtime.mjs");
  assert.match(lazyOutput, /import \{ Details, Profile, SharedCard \} from "\.\/javelin\.shared\.mjs"/);
  const sharedChunk = await readFile(".javelin/javelin.shared.mjs", "utf8");
  assert.match(sharedChunk, /const Details = lazy\(\(\) => import\("\.\/Details\.lazy\.mjs"\)/);
  assert.match(sharedChunk, /class SharedCard extends Component/);
  const lazyChunk = await readFile(".javelin/Details.lazy.mjs", "utf8");
  assert.match(lazyChunk, /class Details extends Component/);
  assert.match(lazyChunk, /import \{ Profile, SharedCard \} from "\.\/javelin\.shared\.mjs"/);
  assert.doesNotMatch(lazyChunk, /class SharedCard/);
  assert.match(lazyChunk, /export default Details/);
  const resourceOutput = await compileJava({ sourceDirectory: "test/fixtures/semantics/resource-options", apiSourceDirectory: "src/main/java/javelin/ui" }, "./runtime.mjs");
  assert.match(resourceOutput, /this\.resourceOptions\(\)\.retry\(3\)\.timeout\(2500\)\.staleTime\(10000\)\.cacheTime\(60000\)\.persistent\("users"\)/);
});

test("Java numeric and array helpers preserve supported edge semantics", () => {
  assert.equal(numericValue("a"), 97);
  assert.equal(castInt(Number.POSITIVE_INFINITY), 2147483647);
  assert.equal(castInt(Number.NaN), 0);
  assert.equal(parseJavaInt("7fffffff", 16), 2147483647);
  assert.throws(() => parseJavaInt("2147483648"), /NumberFormatException/);
  assert.equal(parseJavaDouble(" 1.25f "), 1.25);
  assert.deepEqual(newJavaArray(3, false), [false, false, false]);
  assert.throws(() => newJavaArray(-1, null), /NegativeArraySizeException/);
});

test("ancestor error boundaries catch asynchronous child render failures", async () => {
  installDom();
  class BrokenChild extends Component {
    constructor() { super(); this.broken = this.state(false); }
    render() { if (this.broken.get()) throw new Error("child failed"); return text("ready"); }
  }
  class Boundary extends Component {
    render() { return component(BrokenChild, {}); }
    fallback(error) { return p(text(`caught:${error.message}`)); }
  }
  const handle = mount(Boundary, "#app");
  handle.instance._tree._instance.broken.set(true);
  await new Promise(queueMicrotask);
  assert.equal(document.querySelector("#app").textContent, "caught:child failed");
});

test("portals mount, update, and unmount outside the component DOM range", async () => {
  installDom();
  const target = document.createElement("div");
  target.id = "overlay";
  document.body.append(target);
  class PortalApp extends Component {
    constructor() { super(); this.label = this.state("first"); }
    render() { return div(text("host"), portal("#overlay", p(text(this.label.get())))); }
  }
  const handle = mount(PortalApp, "#app");
  assert.equal(target.textContent, "first");
  handle.instance.label.set("second");
  await new Promise(queueMicrotask);
  assert.equal(target.textContent, "second");
  handle.unmount();
  assert.equal(target.textContent, "");
});

test("lazy components resolve asynchronously and HMR restores state by component identity", async () => {
  installDom();
  class Loaded extends Component { render() { return p(text(`lazy:${this.props.label}`)); } }
  const Lazy = lazy(async () => Loaded);
  mount(class extends Component { render() { return component(Lazy, { label: "ok" }); } }, "#app");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise(queueMicrotask);
  assert.equal(document.querySelector("#app").textContent, "lazy:ok");

  const First = class HotApp extends Component {
    constructor() { super(); this.count = this.state(1); }
    render() { return text(`old:${this.count.get()}`); }
  };
  const firstHandle = mount(First, "#app");
  firstHandle.instance.count.set(7);
  await new Promise(queueMicrotask);
  prepareHmr();
  const Second = class HotApp extends Component {
    constructor() { super(); this.count = this.state(0); }
    render() { return text(`new:${this.count.get()}`); }
  };
  mount(Second, "#app");
  assert.equal(document.querySelector("#app").textContent, "new:7");
});

test("development diagnostics report missing list keys and accessibility names", () => {
  installDom();
  globalThis.__JAVELIN_DEV__ = true;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    mount(class extends Component { render() { return div(each([1, 2], (item) => p(text(item))), tag("img"), button()); } }, "#app");
  } finally {
    console.warn = originalWarn;
    delete globalThis.__JAVELIN_DEV__;
  }
  assert.ok(warnings.some((message) => message.includes("stable key")));
  assert.ok(warnings.some((message) => message.includes("provide alt")));
  assert.ok(warnings.some((message) => message.includes("button elements")));
});

test("production build emits deployable HTML, bundle, and source map", async () => {
  await build();
  const astOutput = await readFile(".javelin/app.entry.mjs", "utf8");
  assert.match(astOutput, /Generated by the Javelin javac AST compiler/);
  assert.match(astOutput, /let status = this\.renderStatus/);
  assert.match(astOutput, /if \(/);
  assert.match(astOutput, /for \(const feature of features\)/);
  assert.match(astOutput, /items\.push/);
  assert.match(astOutput, /text\(this\.item\), text\(Counter\.LABEL\)/);
  assert.doesNotMatch(astOutput, /this\.this\.state/);
  const html = await readFile("dist/index.html", "utf8");
  const assets = await readdir("dist/assets");
  const script = assets.find((name) => /^app-[A-Z0-9]+\.js$/i.test(name));
  const stylesheet = assets.find((name) => /^styles-[a-f0-9]+\.css$/i.test(name));
  assert.ok(script);
  assert.ok(stylesheet);
  assert.match(html, new RegExp(`assets/${script.replace(".", "\\.")}`));
  assert.doesNotMatch(html, /@javelin\/app/);
  assert.match(html, new RegExp(`assets/${stylesheet.replace(".", "\\.")}`));
  assert.ok((await stat(`dist/assets/${script}`)).size > 100);
  assert.ok((await stat(`dist/assets/${script}.map`)).size > 100);
  assert.match(await readFile(`dist/assets/${script}.map`, "utf8"), /Counter\.java/);
  const css = await readFile(`dist/assets/${stylesheet}`, "utf8");
  assert.match(css, /\.bg-indigo-600/);
  assert.match(css, /\.hover\\:bg-indigo-700/);
  assert.match(css, new RegExp(`\\.${cliInternals.moduleClassName("styles/counter.module.css", "panel")}`));
});

test("development server serves generated modules and rejects unknown files", async () => {
  const server = await createDevelopmentServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const [page, app, runtime, styles, spaRoute, missing] = await Promise.all([
      fetch(`${base}/`), fetch(`${base}/@javelin/app.mjs`), fetch(`${base}/@javelin/runtime.mjs`),
      fetch(`${base}/@javelin/styles.css`), fetch(`${base}/application/route`), fetch(`${base}/missing.txt`)
    ]);
    assert.equal(page.status, 200);
    assert.equal(app.status, 200);
    assert.match(await app.text(), /mount\s*\(Counter/);
    assert.equal(runtime.status, 200);
    assert.equal(styles.status, 200);
    assert.match(await styles.text(), /\.bg-indigo-600/);
    assert.equal(spaRoute.status, 200);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    await once(server, "close");
  }
});
