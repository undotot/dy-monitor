export const pickAvatar = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return "";
};
