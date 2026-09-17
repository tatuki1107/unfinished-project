const FRAGMENT = "javelin-fragment";
const PORTAL = Symbol("javelin-portal");
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let renderingComponent = null;
const routeSubscribers = new Set();
const mountedRoots = new WeakMap();
const mountedHandles = new Set();
const warnedDiagnostics = new Set();
const resourceCache = new Map();
let activeHmrSnapshot = null;

export class Component {
  constructor(props = {}) {
    this.props = props ?? {};
    this._tree = null;
    this._parentComponent = null;
    this._scheduled = false;
    this._mounted = false;
    this._effects = [];
    this._effectCursor = 0;
    this._mountCallbacks = [];
    this._unmountCallbacks = [];
    this._hostVNode = null;
    this._children = [];
    this._states = [];
    this._resources = [];
    this._contexts = new Map();
    this._providedContexts = new Map();
  }

  state(initialValue) {
    let value = initialValue;
    const stateObject = {
      get: () => value,
      update: (updater) => {
        const resolved = updater(value);
        if (Object.is(value, resolved)) return;
        value = resolved;
        this._scheduleUpdate();
      },
      set: (nextValue) => {
        const resolved = typeof nextValue === "function" ? nextValue(value) : nextValue;
        if (Object.is(value, resolved)) return;
        value = resolved;
        this._scheduleUpdate();
      },
      _replace: (nextValue) => { value = nextValue; }
    };
    this._states.push(stateObject);
    return stateObject;
  }

  provideContext(contextObject, value) {
    this._providedContexts.set(contextObject, value);
  }

  useContext(contextObject) {
    return this._contexts.has(contextObject) ? this._contexts.get(contextObject) : contextObject.defaultValue;
  }

  children() {
    return this._children;
  }

  resource(...argumentsList) {
    const resourceObject = createResource(this, ...argumentsList);
    this._resources.push(resourceObject);
    return resourceObject;
  }

  resourceOptions() {
    return createResourceOptions();
  }

  field(...argumentsList) {
    const fieldObject = createFormField(this, ...argumentsList);
    return fieldObject;
  }

  effect(callback, dependencies = []) {
    const index = this._effectCursor++;
    const previous = this._effects[index];
    const changed = !previous || dependencies.length !== previous.dependencies.length ||
      dependencies.some((value, dependencyIndex) => !Object.is(value, previous.dependencies[dependencyIndex]));
    this._effects[index] = { callback, dependencies: [...dependencies], cleanup: previous?.cleanup, changed };
  }

  onMount(callback) {
    if (this._mounted) return;
    this._mountCallbacks.push(callback);
  }

  onUnmount(callback) {
    if (this._mounted) return;
    this._unmountCallbacks.push(callback);
  }

  mounted() {}
  unmounted() {}
  shouldUpdate(previousProps, nextProps) { return true; }

  _renderSafely() {
    this._effectCursor = 0;
    this._providedContexts = new Map();
    this._usesRouter = false;
    const previousRendering = renderingComponent;
    renderingComponent = this;
    try {
      const rendered = normalize(this.render());
      if (!this._usesRouter) routeSubscribers.delete(this);
      return rendered;
    } catch (error) {
      if (this.fallback !== Component.prototype.fallback) return normalize(this.fallback(error));
      throw error;
    } finally {
      renderingComponent = previousRendering;
    }
  }

  fallback(error) {
    throw error;
  }

  _scheduleUpdate() {
    if (this._scheduled || !this._mounted) return;
    this._scheduled = true;
    queueMicrotask(() => {
      this._scheduled = false;
      if (!this._mounted) return;
      try {
        const nextTree = this._renderSafely();
        patchNode(this._tree._dom.parentNode, this._tree, nextTree, this);
        this._tree = nextTree;
        syncHostVNode(this);
        this._flushEffects();
      } catch (error) {
        if (!captureComponentError(this, error)) queueMicrotask(() => { throw error; });
      }
    });
  }

  _didMount() {
    this._mounted = true;
    this.mounted();
    for (const callback of this._mountCallbacks) callback();
    this._flushEffects();
  }

  _flushEffects() {
    if (this._effects.length > this._effectCursor) {
      for (const stale of this._effects.splice(this._effectCursor)) {
        if (typeof stale?.cleanup === "function") stale.cleanup();
      }
    }
    for (const effect of this._effects) {
      if (!effect?.changed) continue;
      if (typeof effect.cleanup === "function") effect.cleanup();
      effect.cleanup = effect.callback() ?? null;
      effect.changed = false;
    }
  }

  _dispose() {
    if (!this._mounted) return;
    this._mounted = false;
    routeSubscribers.delete(this);
    for (const resourceObject of this._resources) resourceObject.cancel();
    for (const effect of this._effects) if (typeof effect?.cleanup === "function") effect.cleanup();
    for (const callback of this._unmountCallbacks) callback();
    this.unmounted();
  }
}

export function mount(ComponentType, selector) {
  const container = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!container) throw new Error(`Mount target '${selector}' was not found`);
  mountedRoots.get(container)?.unmount();
  const root = component(ComponentType, {});
  activeHmrSnapshot = globalThis.__javelinHmrSnapshots?.get(container) ?? null;
  globalThis.__javelinHmrSnapshots?.delete(container);
  container.replaceChildren(createDom(root, null));
  activeHmrSnapshot = null;
  activateMounted(root);
  let active = true;
  const handle = {
    instance: root._instance,
    unmount() {
      if (!active) return;
      active = false;
      unmountVNode(root);
      container.replaceChildren();
      if (mountedRoots.get(container) === handle) mountedRoots.delete(container);
      mountedHandles.delete(handle);
    }
  };
  mountedRoots.set(container, handle);
  handle.container = container;
  handle.root = root;
  mountedHandles.add(handle);
  return handle;
}

export function prepareHmr() {
  const snapshots = new Map();
  for (const handle of mountedHandles) snapshots.set(handle.container, snapshotComponents(handle.root));
  globalThis.__javelinHmrSnapshots = snapshots;
}

export function element(type, ...items) {
  const { props, children, keyValue } = collectItems(items);
  return { type, props, children, key: keyValue, _dom: null, _end: null };
}

export function component(ComponentType, props = {}, ...items) {
  const collected = collectItems(items);
  return { type: ComponentType, props: props ?? {}, children: collected.children, key: collected.keyValue, _dom: null, _end: null, _instance: null };
}

export function portal(selector, ...items) {
  const collected = collectItems(items);
  return { type: PORTAL, props: { selector }, children: collected.children, key: collected.keyValue, _dom: null, _end: null,
    _portalTarget: null, _portalStart: null, _portalEnd: null };
}

export function lazy(loader) {
  let loaded = null;
  let failure = null;
  let pending = null;
  return class LazyComponent extends Component {
    constructor(props) {
      super(props);
      pending ??= Promise.resolve().then(loader).then((module) => {
        loaded = module?.default ?? module;
        if (typeof loaded !== "function") throw new Error("lazy() loader must resolve to a Component class");
      }).catch((error) => { failure = error; });
      pending.finally(() => this._scheduleUpdate());
    }
    render() {
      if (failure) throw failure;
      return loaded ? component(loaded, this.props, ...this.children()) : fragment();
    }
  };
}

export function each(values, renderer) {
  if (values == null) return [];
  const rendered = Array.from(values, renderer);
  if (rendered.length > 1 && rendered.some((item) => normalize(item).key == null)) {
    warnDiagnostic("list-keys", "Items returned by each() should have a stable key().");
  }
  return rendered;
}

export function when(condition, truthy, falsy = null) {
  const selected = condition ? truthy : falsy;
  return typeof selected === "function" ? selected() : selected;
}

export const div = (...items) => element("div", ...items);
export const span = (...items) => element("span", ...items);
export const h1 = (...items) => element("h1", ...items);
export const h2 = (...items) => element("h2", ...items);
export const p = (...items) => element("p", ...items);
export const button = (...items) => element("button", ...items);
export const form = (...items) => element("form", ...items);
export const input = (...items) => element("input", ...items);
export const textarea = (...items) => element("textarea", ...items);
export const select = (...items) => element("select", ...items);
export const option = (...items) => element("option", ...items);
export const label = (...items) => element("label", ...items);
export const ul = (...items) => element("ul", ...items);
export const li = (...items) => element("li", ...items);
export const a = (...items) => element("a", ...items);
export const img = (...items) => element("img", ...items);
export const tag = (name, ...items) => {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || ["script", "iframe", "object", "embed"].includes(name)) {
    throw new Error(`Unsafe element name '${name}'`);
  }
  return element(name, ...items);
};
export const fragment = (...items) => element(FRAGMENT, ...items);
export const text = (current) => ({ type: "#text", value: String(current ?? ""), props: {}, children: [], key: null, _dom: null, _end: null });

export const key = (current) => property({}, current);
export const className = (current) => property({ class: current });
export const tw = (...classes) => className(classes.flat().filter(Boolean).join(" "));
export const twWhen = (condition, truthy, falsy = "") => className(condition ? truthy : falsy);
export const cssModule = (modulePath, localName) => className(moduleClassName(modulePath, localName));
export const id = (current) => property({ id: current });
export const value = (current) => property({ value: current });
export const checked = (current) => property({ checked: current });
export const selected = (current) => property({ selected: current });
export const disabled = (current) => property({ disabled: current });
export const required = (current) => property({ required: current });
export const multiple = (current) => property({ multiple: current });
export const placeholder = (current) => property({ placeholder: current });
export const href = (current) => property({ href: safeUrl(current) });
export const src = (current) => property({ src: safeUrl(current, { allowDataImage: true }) });
export const alt = (current) => property({ alt: current });
export const title = (current) => property({ title: current });
export const role = (current) => property({ role: current });
export const tabIndex = (current) => property({ tabindex: current });
export const name = (current) => property({ name: current });
export const type = (current) => property({ type: current });
export const forId = (current) => property({ for: current });
export const aria = (name, current) => {
  const suffix = String(name).toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(suffix)) throw new Error(`Invalid ARIA attribute '${name}'`);
  const known = new Set(["label", "labelledby", "describedby", "hidden", "expanded", "pressed", "selected", "checked", "current", "controls", "live", "atomic", "busy", "disabled", "invalid", "required", "valuemin", "valuemax", "valuenow", "valuetext", "readonly", "multiselectable", "modal"]);
  if (!known.has(suffix)) warnDiagnostic("aria-name", `Unknown ARIA attribute 'aria-${suffix}'.`);
  return property({ [`aria-${suffix}`]: current });
};
export const data = (name, current) => {
  const suffix = String(name).toLowerCase();
  if (!/^[a-z][a-z0-9_.:-]*$/.test(suffix)) throw new Error(`Invalid data attribute '${name}'`);
  return property({ [`data-${suffix}`]: current });
};
export const attr = (name, current) => {
  const attributeName = String(name);
  const normalizedName = attributeName.toLowerCase();
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(attributeName) || /^on/i.test(attributeName) || normalizedName === "srcdoc") {
    throw new Error(`Unsafe attribute name '${attributeName}'`);
  }
  const urlAttributes = new Set(["href", "xlink:href", "action", "formaction", "poster"]);
  const value = normalizedName === "src"
    ? safeUrl(current, { allowDataImage: true })
    : urlAttributes.has(normalizedName) ? safeUrl(current) : current;
  return property({ [attributeName]: value });
};
export const style = (values) => property({ style: values });
export const onClick = (handler) => property({ onClick: handler });
export const onInput = (handler) => property({ onInput: handler });
export const onChange = (handler) => property({ onChange: handler });
export const onSubmit = (handler) => property({ onSubmit: handler });
export const ref = (callback) => property({ ref: callback });
export const eventValue = (event) => event?.target?.value ?? "";
export const eventChecked = (event) => Boolean(event?.target?.checked);
export const context = (defaultValue) => Object.freeze({ defaultValue, id: Symbol("javelin-context") });

export function route(pattern, renderer) {
  return { __javelinRoute: true, pattern, renderer };
}

export function routeGroup(prefix, layoutRenderer, ...routes) {
  return { __javelinRouteGroup: true, prefix, layoutRenderer, routes: routes.flat() };
}

export function guard(allowed, redirectTo, guardedRoute) {
  return { __javelinGuard: true, allowed, redirectTo, guardedRoute };
}

export function redirect(pattern, destination) {
  return { __javelinRedirect: true, pattern, destination };
}

export function router(...routes) {
  if (renderingComponent) {
    renderingComponent._usesRouter = true;
    routeSubscribers.add(renderingComponent);
  }
  const location = globalThis.location;
  const path = location?.pathname ?? "/";
  for (const candidate of routes.flat()) {
    const resolved = resolveRoute(candidate, path, location, "");
    if (resolved) return normalize(resolved);
  }
  return text("");
}

export function navigate(path) {
  if (!globalThis.history || !globalThis.location) return;
  const destination = new URL(path, globalThis.location.href);
  if (destination.origin !== globalThis.location.origin) throw new Error("navigate() only supports same-origin URLs");
  if (globalThis.location.href !== destination.href) globalThis.history.pushState({}, "", destination.href);
  for (const subscriber of routeSubscribers) subscriber._scheduleUpdate();
}

export function link(path, ...items) {
  return a(href(path), onClick((event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  }), ...items);
}

export const formValid = (...fields) => fields.flat().every((fieldObject) => fieldObject.valid());

export function modal(open, labelText, ...items) {
  if (!open) return fragment();
  return portal("body", div(
    className("javelin-modal-backdrop fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"),
    div(role("dialog"), aria("modal", "true"), aria("label", labelText),
      className("javelin-modal-panel max-h-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-2xl"), ...items)
  ));
}

export function spinner(labelText = "Loading") {
  return span(role("status"), aria("label", labelText), className("javelin-spinner inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent"));
}

function property(values, keyValue = null) {
  return { __javelinProperty: true, values, keyValue };
}

function collectItems(items) {
  const props = {};
  const children = [];
  let keyValue = null;
  for (const item of items.flat(Infinity)) {
    if (item == null || item === false) continue;
    if (item.__javelinProperty) {
      for (const [name, current] of Object.entries(item.values)) {
        props[name] = name === "class" && props[name] ? `${props[name]} ${current}` : current;
      }
      if (item.keyValue != null) keyValue = item.keyValue;
    } else children.push(normalize(item));
  }
  return { props, children, keyValue };
}

function normalize(current) {
  if (current && typeof current === "object" && current.type) return current;
  if (Array.isArray(current)) return fragment(...current);
  if (current == null || current === false || current === true) return fragment();
  return text(current);
}

function createDom(vnode, parentComponent, namespace = null) {
  if (vnode.type === "#text") {
    vnode._dom = document.createTextNode(vnode.value);
    vnode._end = vnode._dom;
    return vnode._dom;
  }
  if (vnode.type === FRAGMENT) {
    const container = document.createDocumentFragment();
    vnode._dom = document.createComment("javelin-fragment-start");
    vnode._end = document.createComment("javelin-fragment-end");
    container.append(vnode._dom);
    for (const child of vnode.children) container.append(createDom(child, parentComponent, namespace));
    container.append(vnode._end);
    return container;
  }
  if (vnode.type === PORTAL) {
    vnode._dom = document.createComment("javelin-portal");
    vnode._end = vnode._dom;
    vnode._portalTarget = resolvePortalTarget(vnode.props.selector);
    vnode._portalStart = document.createComment("javelin-portal-start");
    vnode._portalEnd = document.createComment("javelin-portal-end");
    vnode._portalTarget.append(vnode._portalStart);
    for (const child of vnode.children) vnode._portalTarget.append(createDom(child, parentComponent, namespaceForParent(vnode._portalTarget)));
    vnode._portalTarget.append(vnode._portalEnd);
    return vnode._dom;
  }
  if (typeof vnode.type === "function") {
    const instance = new vnode.type(vnode.props);
    restoreComponentState(instance);
    instance._children = vnode.children;
    instance._parentComponent = parentComponent;
    inheritContexts(instance, parentComponent);
    instance._hostVNode = vnode;
    vnode._instance = instance;
    instance._tree = instance._renderSafely();
    let rendered;
    try {
      rendered = createDom(instance._tree, instance, namespace);
    } catch (error) {
      if (instance.fallback === Component.prototype.fallback) throw error;
      unmountVNode(instance._tree);
      instance._tree = normalize(instance.fallback(error));
      rendered = createDom(instance._tree, instance, namespace);
    }
    vnode._dom = instance._tree._dom;
    vnode._end = instance._tree._end;
    return rendered;
  }
  const ownNamespace = vnode.type === "svg" || namespace === SVG_NAMESPACE ? SVG_NAMESPACE : null;
  const node = ownNamespace ? document.createElementNS(ownNamespace, vnode.type) : document.createElement(vnode.type);
  vnode._dom = node;
  vnode._end = node;
  updateProperties(node, {}, vnode.props);
  const childNamespace = ownNamespace === SVG_NAMESPACE && vnode.type !== "foreignObject" ? SVG_NAMESPACE : null;
  for (const child of vnode.children) node.append(createDom(child, parentComponent, childNamespace));
  diagnoseElement(vnode);
  return node;
}

function patchNode(parent, oldVNode, newVNode, parentComponent, before = null) {
  if (!oldVNode) {
    const dom = createDom(newVNode, parentComponent, namespaceForParent(parent));
    parent.insertBefore(dom, before);
    activateMounted(newVNode);
    return;
  }
  if (!newVNode) {
    unmountVNode(oldVNode);
    removeRange(oldVNode);
    return;
  }
  if (oldVNode.type !== newVNode.type || oldVNode.key !== newVNode.key) {
    const dom = createDom(newVNode, parentComponent, namespaceForParent(parent));
    parent.insertBefore(dom, oldVNode._dom);
    unmountVNode(oldVNode);
    removeRange(oldVNode);
    activateMounted(newVNode);
    return;
  }
  if (newVNode.type === "#text") {
    newVNode._dom = oldVNode._dom;
    newVNode._end = oldVNode._end;
    if (oldVNode.value !== newVNode.value) newVNode._dom.nodeValue = newVNode.value;
    return;
  }
  if (newVNode.type === FRAGMENT) {
    newVNode._dom = oldVNode._dom;
    newVNode._end = oldVNode._end;
    reconcileChildren(parent, oldVNode.children, newVNode.children, parentComponent, oldVNode._end);
    return;
  }
  if (newVNode.type === PORTAL) {
    newVNode._dom = oldVNode._dom;
    newVNode._end = oldVNode._end;
    const nextTarget = resolvePortalTarget(newVNode.props.selector);
    if (nextTarget !== oldVNode._portalTarget) {
      for (const child of oldVNode.children) { unmountVNode(child); removeRange(child); }
      oldVNode._portalStart?.remove();
      oldVNode._portalEnd?.remove();
      newVNode._portalStart = document.createComment("javelin-portal-start");
      newVNode._portalEnd = document.createComment("javelin-portal-end");
      nextTarget.append(newVNode._portalStart);
      for (const child of newVNode.children) nextTarget.append(createDom(child, parentComponent, namespaceForParent(nextTarget)));
      nextTarget.append(newVNode._portalEnd);
      for (const child of newVNode.children) activateMounted(child);
    } else {
      newVNode._portalStart = oldVNode._portalStart;
      newVNode._portalEnd = oldVNode._portalEnd;
      reconcileChildren(nextTarget, oldVNode.children, newVNode.children, parentComponent, oldVNode._portalEnd);
    }
    newVNode._portalTarget = nextTarget;
    return;
  }
  if (typeof newVNode.type === "function") {
    const instance = oldVNode._instance;
    newVNode._instance = instance;
    instance._hostVNode = newVNode;
    const previousProps = instance.props;
    const previousChildren = instance._children;
    instance.props = newVNode.props;
    instance._children = newVNode.children;
    const contextChanged = inheritContexts(instance, parentComponent);
    const childrenChanged = !sameChildren(previousChildren, newVNode.children);
    if (!contextChanged && !childrenChanged && !instance.shouldUpdate(previousProps, newVNode.props)) {
      newVNode._dom = oldVNode._dom;
      newVNode._end = oldVNode._end;
      return;
    }
    const nextTree = instance._renderSafely();
    try {
      patchNode(instance._tree._dom.parentNode, instance._tree, nextTree, instance);
      instance._tree = nextTree;
    } catch (error) {
      if (instance.fallback === Component.prototype.fallback) throw error;
      replaceComponentTreeWithFallback(instance, error);
    }
    newVNode._dom = instance._tree._dom;
    newVNode._end = instance._tree._end;
    instance._flushEffects();
    return;
  }
  newVNode._dom = oldVNode._dom;
  newVNode._end = oldVNode._end;
  updateProperties(newVNode._dom, oldVNode.props, newVNode.props);
  reconcileChildren(newVNode._dom, oldVNode.children, newVNode.children, parentComponent);
}

function reconcileChildren(parent, oldChildren, newChildren, parentComponent, boundary = null) {
  const keyed = new Map(oldChildren.filter((child) => child.key != null).map((child) => [child.key, child]));
  const used = new Set();
  const nextKeys = new Set();
  let cursor = boundary ? oldChildren[0]?._dom ?? boundary : parent.firstChild;
  for (let index = 0; index < newChildren.length; index++) {
    const next = newChildren[index];
    if (next.key != null && nextKeys.has(next.key)) throw new Error(`Duplicate child key '${next.key}'`);
    if (next.key != null) nextKeys.add(next.key);
    let previous = next.key != null
      ? keyed.get(next.key)
      : oldChildren[index]?.key == null ? oldChildren[index] : oldChildren.find((child) => child.key == null && !used.has(child));
    if (previous && used.has(previous)) previous = null;
    if (previous) used.add(previous);
    patchNode(parent, previous, next, parentComponent, boundary);
    // A replacement can detach the node currently used as the insertion cursor.
    // The replacement already occupies that position, so continue from its range.
    if (cursor && cursor.parentNode !== parent) cursor = next._dom;
    if (next._dom !== cursor) moveRange(parent, next, cursor ?? boundary);
    cursor = next._end.nextSibling;
  }
  for (const previous of oldChildren) {
    if (!used.has(previous)) {
      unmountVNode(previous);
      removeRange(previous);
    }
  }
}

function activateMounted(vnode) {
  if (typeof vnode.type === "function") {
    activateMounted(vnode._instance._tree);
    vnode._instance._didMount();
  } else for (const child of vnode.children) activateMounted(child);
}

function unmountVNode(vnode) {
  if (!vnode) return;
  if (typeof vnode.type === "function") {
    unmountVNode(vnode._instance?._tree);
    vnode._instance?._dispose();
  } else {
    for (const child of vnode.children ?? []) {
      unmountVNode(child);
      if (vnode.type === PORTAL) removeRange(child);
    }
    if (vnode.type === PORTAL) {
      vnode._portalStart?.remove();
      vnode._portalEnd?.remove();
    }
    if (typeof vnode.props?.ref === "function") vnode.props.ref(null);
  }
  removeAllEvents(vnode._dom);
}

function removeRange(vnode) {
  let node = vnode?._dom;
  const end = vnode?._end ?? node;
  while (node) {
    const next = node.nextSibling;
    node.remove();
    if (node === end) break;
    node = next;
  }
}

function moveRange(parent, vnode, before) {
  const fragmentNode = document.createDocumentFragment();
  let node = vnode._dom;
  while (node) {
    const next = node.nextSibling;
    fragmentNode.append(node);
    if (node === vnode._end) break;
    node = next;
  }
  parent.insertBefore(fragmentNode, before);
}

function namespaceForParent(parent) {
  return parent?.namespaceURI === SVG_NAMESPACE && parent.localName !== "foreignObject" ? SVG_NAMESPACE : null;
}

function updateProperties(node, previous, next) {
  for (const name of Object.keys(previous)) if (!(name in next)) setProperty(node, name, undefined, previous[name]);
  for (const [name, current] of Object.entries(next)) {
    if (!Object.is(previous[name], current)) setProperty(node, name, current, previous[name]);
  }
}

function setProperty(node, name, current, previous) {
  if (name.startsWith("on") && typeof current === "function") {
    setEvent(node, name.slice(2).toLowerCase(), current);
  } else if (name.startsWith("on")) {
    removeEvent(node, name.slice(2).toLowerCase());
  } else if (name === "ref") {
    if (typeof previous === "function") previous(null);
    if (typeof current === "function") current(node);
  } else if (name === "style" && typeof current === "object" && current) {
    node.removeAttribute("style");
    Object.assign(node.style, current instanceof Map ? Object.fromEntries(current) : current);
  } else if (["value", "checked", "disabled", "selected", "required", "multiple"].includes(name)) {
    const nextValue = current ?? (name === "value" ? "" : false);
    if (!Object.is(node[name], nextValue)) node[name] = nextValue;
    if (current == null || current === false) node.removeAttribute(name);
  } else if (current == null || current === false) {
    node.removeAttribute(name);
  } else {
    node.setAttribute(name, current === true ? "" : String(current));
  }
}

function setEvent(node, event, handler) {
  node.__javelinEvents ??= {};
  let entry = node.__javelinEvents[event];
  if (!entry) {
    entry = { handler, listener: (browserEvent) => entry.handler(browserEvent) };
    node.__javelinEvents[event] = entry;
    node.addEventListener(event, entry.listener);
  } else entry.handler = handler;
}

function removeEvent(node, event) {
  const entry = node?.__javelinEvents?.[event];
  if (!entry) return;
  node.removeEventListener(event, entry.listener);
  delete node.__javelinEvents[event];
}

function removeAllEvents(node) {
  if (!node?.__javelinEvents) return;
  for (const event of Object.keys(node.__javelinEvents)) removeEvent(node, event);
}

function safeUrl(current, { allowDataImage = false } = {}) {
  const value = String(current ?? "").trim();
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error("Unsafe control character in URL");
  if (allowDataImage && /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  let parsed;
  try {
    parsed = new URL(value, "https://javelin.invalid/");
  } catch {
    throw new Error("Invalid URL");
  }
  const allowedProtocols = allowDataImage
    ? new Set(["http:", "https:", "blob:"])
    : new Set(["http:", "https:", "mailto:", "tel:"]);
  if (!allowedProtocols.has(parsed.protocol)) throw new Error(`Unsafe URL scheme '${parsed.protocol}'`);
  return value;
}

function moduleClassName(modulePath, localName) {
  const path = String(modulePath).replaceAll("\\", "/").replace(/^\.\//, "");
  const name = String(localName);
  if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new Error(`Invalid CSS Module class '${name}'`);
  let hash = 0x811c9dc5;
  for (const character of `${path}:${name}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${name}_${(hash >>> 0).toString(36)}`;
}

function matchRoute(pattern, path) {
  if (pattern === "*") return { get() { return null; } };
  const names = [];
  const catchAll = pattern.endsWith("/*");
  const routePattern = catchAll ? pattern.slice(0, -2) : pattern;
  const source = routePattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:([A-Za-z_$][\w$]*)/g, (_, name) => {
    names.push(name);
    return "([^/]+)";
  });
  const match = new RegExp(catchAll ? `^${source}(?:/.*)?/?$` : `^${source}/?$`).exec(path);
  if (!match) return null;
  let values;
  try {
    values = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
  } catch {
    return null;
  }
  return { get: (name) => values[name] ?? null };
}

function resolveRoute(candidate, path, location, prefix) {
  if (candidate?.__javelinGuard) {
    const allowed = typeof candidate.allowed === "function" ? candidate.allowed() : candidate.allowed;
    if (!allowed) {
      queueMicrotask(() => navigate(candidate.redirectTo));
      return fragment();
    }
    return resolveRoute(candidate.guardedRoute, path, location, prefix);
  }
  if (candidate?.__javelinRouteGroup) {
    const groupPrefix = joinRoutePatterns(prefix, candidate.prefix);
    for (const child of candidate.routes) {
      const resolved = resolveRoute(child, path, location, groupPrefix);
      if (resolved) return typeof candidate.layoutRenderer === "function" ? candidate.layoutRenderer(normalize(resolved)) : resolved;
    }
    return null;
  }
  const pattern = joinRoutePatterns(prefix, candidate.pattern);
  const match = matchRoute(pattern, path);
  if (!match) return null;
  if (candidate.__javelinRedirect) {
    queueMicrotask(() => navigate(candidate.destination));
    return fragment();
  }
  const query = new URLSearchParams(location?.search ?? "");
  const params = {
    get: match.get,
    query: (name) => query.get(name),
    hash: () => (location?.hash ?? "").replace(/^#/, "")
  };
  return typeof candidate.renderer === "function" ? candidate.renderer(params) : candidate.renderer;
}

function joinRoutePatterns(prefix, pattern) {
  if (pattern === "*") return prefix ? `${prefix.replace(/\/$/, "")}/*` : "*";
  return `/${prefix}/${pattern}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function inheritContexts(instance, parentComponent) {
  const next = new Map(parentComponent?._contexts ?? []);
  for (const [contextObject, value] of parentComponent?._providedContexts ?? []) next.set(contextObject, value);
  const changed = next.size !== instance._contexts.size ||
    [...next].some(([contextObject, value]) => !instance._contexts.has(contextObject) || !Object.is(instance._contexts.get(contextObject), value));
  instance._contexts = next;
  return changed;
}

function sameChildren(previous, next) {
  return previous.length === next.length && previous.every((child, index) => child === next[index]);
}

function resolvePortalTarget(selector) {
  const target = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!target || typeof target.append !== "function") throw new Error(`Portal target '${selector}' was not found`);
  return target;
}

function syncHostVNode(instance) {
  if (!instance._hostVNode) return;
  instance._hostVNode._dom = instance._tree._dom;
  instance._hostVNode._end = instance._tree._end;
}

function replaceComponentTreeWithFallback(instance, error) {
  const oldTree = instance._tree;
  const parent = oldTree?._dom?.parentNode;
  if (!parent) return false;
  const fallbackTree = normalize(instance.fallback(error));
  const fallbackDom = createDom(fallbackTree, instance, namespaceForParent(parent));
  parent.insertBefore(fallbackDom, oldTree._dom);
  activateMounted(fallbackTree);
  unmountVNode(oldTree);
  removeRange(oldTree);
  instance._tree = fallbackTree;
  syncHostVNode(instance);
  instance._flushEffects();
  return true;
}

function captureComponentError(source, error) {
  let boundary = source;
  while (boundary) {
    if (boundary.fallback !== Component.prototype.fallback) {
      try { return replaceComponentTreeWithFallback(boundary, error); }
      catch (fallbackError) { error = fallbackError; }
    }
    boundary = boundary._parentComponent;
  }
  return false;
}

function snapshotComponents(root) {
  const entries = [];
  const visit = (vnode) => {
    if (!vnode) return;
    if (typeof vnode.type === "function" && vnode._instance) {
      entries.push({ name: vnode._instance.constructor.name, values: vnode._instance._states.map((stateObject) => stateObject.get()) });
      visit(vnode._instance._tree);
    } else for (const child of vnode.children ?? []) visit(child);
  };
  visit(root);
  return { entries, cursor: 0 };
}

function restoreComponentState(instance) {
  if (!activeHmrSnapshot) return;
  const entries = activeHmrSnapshot.entries;
  let index = activeHmrSnapshot.cursor;
  while (index < entries.length && entries[index].name !== instance.constructor.name) index++;
  if (index >= entries.length) return;
  activeHmrSnapshot.cursor = index + 1;
  const values = entries[index].values;
  instance._states.forEach((stateObject, stateIndex) => {
    if (stateIndex < values.length) stateObject._replace(values[stateIndex]);
  });
}

function warnDiagnostic(code, message) {
  if (globalThis.__JAVELIN_DEV__ !== true || warnedDiagnostics.has(`${code}:${message}`)) return;
  warnedDiagnostics.add(`${code}:${message}`);
  console.warn(`[Javelin UI] ${message}`);
}

function diagnoseElement(vnode) {
  if (globalThis.__JAVELIN_DEV__ !== true) return;
  if (vnode.type === "img" && !("alt" in vnode.props)) warnDiagnostic("img-alt", "img elements should provide alt().");
  if (vnode.type === "button" && !vnode.children.length && !vnode.props["aria-label"] && !vnode.props.title) {
    warnDiagnostic("button-name", "button elements should have text, aria('label', ...), or title().");
  }
  if (vnode.type === "ul" && vnode.children.some((child) => child.type !== "li" && child.type !== FRAGMENT)) {
    warnDiagnostic("ul-child", "ul elements should contain li elements directly.");
  }
  if (vnode.type === "p" && vnode.children.some((child) => ["div", "p", "h1", "h2", "form", "ul"].includes(child.type))) {
    warnDiagnostic("p-nesting", "p elements cannot contain block-level elements such as div, p, form, or ul.");
  }
}

export function numericValue(value) {
  return typeof value === "string" && value.length === 1 ? value.charCodeAt(0) : Number(value);
}

export function castInt(value) {
  const number = Math.trunc(numericValue(value));
  if (Number.isNaN(number)) return 0;
  return Math.max(-2147483648, Math.min(2147483647, number));
}

export const castByte = (value) => (castInt(value) << 24) >> 24;
export const castShort = (value) => (castInt(value) << 16) >> 16;
export const castChar = (value) => String.fromCharCode(castInt(value) & 0xffff);
export const castFloat = (value) => Math.fround(numericValue(value));

export function newJavaArray(length, defaultValue) {
  const size = castInt(length);
  if (size < 0) throw new Error(`NegativeArraySizeException: ${size}`);
  return Array(size).fill(defaultValue);
}

export function parseJavaInt(value, radix = 10) {
  const source = String(value);
  const base = Number(radix);
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error(`NumberFormatException: invalid radix ${radix}`);
  const sign = source.startsWith("-") || source.startsWith("+") ? source[0] : "";
  const digits = sign ? source.slice(1) : source;
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz".slice(0, base);
  if (!digits || [...digits.toLowerCase()].some((character) => !alphabet.includes(character))) throw new Error(`NumberFormatException: ${source}`);
  const parsed = Number.parseInt(source, base);
  if (!Number.isSafeInteger(parsed) || parsed < -2147483648 || parsed > 2147483647) throw new Error(`NumberFormatException: ${source}`);
  return parsed;
}

export function parseJavaDouble(value) {
  const source = String(value).replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
  if (!/^[+-]?(?:NaN|Infinity|(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?))[fFdD]?$/.test(source)) {
    throw new Error(`NumberFormatException: ${source}`);
  }
  return Number(source.replace(/[fFdD]$/, ""));
}

function createResource(owner, ...argumentsList) {
  let method = "GET";
  let url;
  let body = null;
  let decoder;
  let options = createResourceOptions();
  if (argumentsList.length === 2) [url, decoder] = argumentsList;
  else if (argumentsList.length === 3) [url, decoder, options] = argumentsList;
  else if (argumentsList.length === 4) [method, url, body, decoder] = argumentsList;
  else [method, url, body, decoder, options] = argumentsList;
  options = normalizeResourceOptions(options);
  method = String(method).toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new Error(`Unsupported HTTP method '${method}'`);
  if (typeof decoder !== "function") throw new Error("resource() requires a JSON decoder");
  let value = null;
  let loading = false;
  let failure = null;
  let controller = null;
  let requestVersion = 0;
  const cacheKey = method === "GET" ? `${method}:${String(url)}` : null;
  const persistentKey = options._persistentKey && cacheKey ? `javelin:${options._persistentKey}:${cacheKey}` : null;

  const cacheEntry = async () => {
    let cached = cacheKey ? resourceCache.get(cacheKey) : null;
    if (!cached && persistentKey) {
      cached = await persistentCacheGet(persistentKey);
      if (cached) resourceCache.set(cacheKey, cached);
    }
    return cached;
  };

  const request = async (version) => {
    let lastError;
    const retryableMethod = method === "GET";
    for (let attempt = 0; attempt <= options._retry; attempt++) {
      if (version !== requestVersion) {
        const cancelled = new Error("Request cancelled");
        cancelled.name = "AbortError";
        throw cancelled;
      }
      controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, options._timeout);
      try {
        const response = await fetch(String(url), {
          method,
          credentials: "same-origin",
          signal: controller.signal,
          headers: body == null ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
          body: body == null ? undefined : JSON.stringify(body instanceof Map ? Object.fromEntries(body) : body)
        });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
          error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          throw error;
        }
        return await response.json();
      } catch (error) {
        if (timedOut) {
          lastError = new Error(`Request timed out after ${options._timeout}ms`);
          lastError.retryable = true;
        } else lastError = error;
        const retry = retryableMethod && attempt < options._retry && (lastError.retryable || lastError instanceof TypeError);
        if (!retry) throw lastError;
        await delay(options._retryDelay * (2 ** attempt));
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError;
  };

  const notify = () => owner._scheduleUpdate();
  const load = async ({ bypassCache = false } = {}) => {
    const version = ++requestVersion;
    controller?.abort();
    controller = new AbortController();
    failure = null;
    loading = true;
    notify();
    try {
      const cached = await cacheEntry();
      const age = cached ? Date.now() - cached.time : Number.POSITIVE_INFINITY;
      const offline = options._offline && globalThis.navigator?.onLine === false;
      if (cached && (offline || age <= options._cacheTime)) {
        value = decoder(wrapJson(cached.json));
        if (!bypassCache && (offline || age <= options._staleTime)) return value;
      }
      if (offline) throw new Error(cached ? "Offline; showing cached data" : "Offline and no cached data is available");
      const json = await request(version);
      const decoded = decoder(wrapJson(json));
      if (version !== requestVersion) return null;
      value = decoded;
      const entry = { json, time: Date.now() };
      if (cacheKey) resourceCache.set(cacheKey, entry);
      if (persistentKey) await persistentCachePut(persistentKey, entry);
      return value;
    } catch (error) {
      if (version === requestVersion && error?.name !== "AbortError") failure = error;
      return null;
    } finally {
      if (version === requestVersion) {
        loading = false;
        notify();
      }
    }
  };

  const resourceObject = {
    loading: () => loading,
    hasValue: () => value != null,
    get: () => value,
    errorMessage: () => failure?.message ?? null,
    reload: () => load({ bypassCache: true }),
    mutate: (nextValue) => { value = typeof nextValue === "function" ? nextValue(value) : nextValue; failure = null; notify(); },
    cancel: () => {
      requestVersion++;
      controller?.abort();
      loading = false;
      if (reconnectHandler) globalThis.removeEventListener?.("online", reconnectHandler);
    }
  };
  const reconnectHandler = options._revalidateOnReconnect ? () => load({ bypassCache: true }) : null;
  if (reconnectHandler) globalThis.addEventListener?.("online", reconnectHandler);
  load();
  return resourceObject;
}

function createResourceOptions() {
  const options = {
    _retry: 0, _retryDelay: 500, _timeout: 10_000, _staleTime: 30_000, _cacheTime: 300_000,
    _persistentKey: null, _offline: true, _revalidateOnReconnect: true,
    retry(value) { this._retry = nonNegativeInteger(value, "retry"); return this; },
    retryDelay(value) { this._retryDelay = nonNegativeInteger(value, "retryDelay"); return this; },
    timeout(value) { this._timeout = positiveInteger(value, "timeout"); return this; },
    staleTime(value) { this._staleTime = nonNegativeInteger(value, "staleTime"); return this; },
    cacheTime(value) { this._cacheTime = nonNegativeInteger(value, "cacheTime"); return this; },
    persistent(key) { this._persistentKey = String(key); if (!this._persistentKey) throw new Error("persistent key cannot be empty"); return this; },
    offline(value) { this._offline = Boolean(value); return this; },
    revalidateOnReconnect(value) { this._revalidateOnReconnect = Boolean(value); return this; }
  };
  return options;
}

function normalizeResourceOptions(options) {
  if (!options || typeof options !== "object" || typeof options.retry !== "function") throw new Error("Invalid ResourceOptions");
  if (options._cacheTime < options._staleTime) throw new Error("cacheTime must be greater than or equal to staleTime");
  return options;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const nonNegativeInteger = (value, name) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${name} must be a non-negative integer`);
  return number;
};
const positiveInteger = (value, name) => {
  const number = nonNegativeInteger(value, name);
  if (number === 0) throw new Error(`${name} must be greater than zero`);
  return number;
};

let persistentDatabasePromise = null;
function persistentDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  persistentDatabasePromise ??= new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open("javelin-ui", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("resource-cache");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return persistentDatabasePromise;
}

async function persistentCacheGet(key) {
  try {
    const database = await persistentDatabase();
    if (!database) return null;
    return await new Promise((resolve, reject) => {
      const request = database.transaction("resource-cache", "readonly").objectStore("resource-cache").get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    warnDiagnostic("persistent-cache", `IndexedDB cache read failed: ${error.message}`);
    return null;
  }
}

async function persistentCachePut(key, entry) {
  try {
    const database = await persistentDatabase();
    if (!database) return;
    await new Promise((resolve, reject) => {
      const request = database.transaction("resource-cache", "readwrite").objectStore("resource-cache").put(entry, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    warnDiagnostic("persistent-cache", `IndexedDB cache write failed: ${error.message}`);
  }
}

function wrapJson(value) {
  const read = (name) => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON value is not an object");
    if (!(name in value)) throw new Error(`Missing JSON property '${name}'`);
    return value[name];
  };
  return {
    raw: () => value,
    string: (name) => { const current = read(name); if (typeof current !== "string") throw new Error(`JSON property '${name}' is not a string`); return current; },
    integer: (name) => { const current = read(name); if (!Number.isInteger(current)) throw new Error(`JSON property '${name}' is not an integer`); return current; },
    number: (name) => { const current = read(name); if (typeof current !== "number" || !Number.isFinite(current)) throw new Error(`JSON property '${name}' is not a finite number`); return current; },
    bool: (name) => { const current = read(name); if (typeof current !== "boolean") throw new Error(`JSON property '${name}' is not a boolean`); return current; },
    object: (name) => wrapJson(read(name)),
    array: (name) => { const current = read(name); if (!Array.isArray(current)) throw new Error(`JSON property '${name}' is not an array`); return current.map(wrapJson); }
  };
}

function createFormField(owner, initialValue, parserOrValidator, maybeValidator) {
  let value = initialValue;
  const initial = initialValue;
  const parser = maybeValidator ? parserOrValidator : (current) => current;
  const validator = maybeValidator ?? parserOrValidator;
  let touched = false;
  let error = null;
  const validate = () => {
    error = typeof validator === "function" ? validator(value) : null;
    return error == null || error === "";
  };
  validate();
  const set = (nextValue, markTouched = true) => {
    value = typeof nextValue === "function" ? nextValue(value) : nextValue;
    if (markTouched) touched = true;
    validate();
    owner._scheduleUpdate();
  };
  return {
    get: () => value,
    set: (nextValue) => set(nextValue),
    error: () => error,
    valid: () => validate(),
    touched: () => touched,
    input: () => property({ value, onInput: (event) => set(parser(eventValue(event))) }),
    reset: () => { value = initial; touched = false; validate(); owner._scheduleUpdate(); }
  };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("popstate", () => {
    for (const subscriber of routeSubscribers) subscriber._scheduleUpdate();
  });
}

export const internals = { normalize, createDom, patchNode, reconcileChildren, unmountVNode, clearResourceCache: () => resourceCache.clear() };
