export const createPageScrollLock = (pageDocument) => {
  let snapshot = null;
  const properties = ["overflow-x", "overflow-y", "overscroll-behavior-x", "overscroll-behavior-y", "scrollbar-gutter"];
  const lock = () => {
    if (snapshot) return;
    snapshot = [pageDocument.documentElement, pageDocument.body].filter(Boolean).map((element) => ({
      element,
      values: properties.map((property) => ({ property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) }))
    }));
    for (const { element } of snapshot) {
      for (const property of properties) {
        const value = property === "scrollbar-gutter" ? "auto" : property.startsWith("overflow-") ? "hidden" : "none";
        element.style.setProperty(property, value, "important");
      }
    }
  };
  const unlock = () => {
    if (!snapshot) return;
    for (const { element, values } of snapshot) for (const { property, value, priority } of values) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
    snapshot = null;
  };
  return { lock, unlock };
};
