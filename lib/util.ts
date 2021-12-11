export function titleCaseDomain(domainName: string): string {
  return domainName.split(".").map((part) => part[0].toUpperCase() + part.slice(1)).join("");
}