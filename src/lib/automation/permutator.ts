export interface Permutation {
  email: string;
  pattern: string;
}

/**
 * Generates common corporate email permutations for a given person and domain.
 * The pattern tags use {first}, {last}, {f} (first initial), and {l} (last initial)
 * to perfectly match the intelligence-store Pattern Engine.
 */
export function generatePermutations(firstName: string, lastName: string, domain: string): Permutation[] {
  if (!firstName || !domain) return [];

  const first = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const last = lastName ? lastName.toLowerCase().replace(/[^a-z]/g, "") : "";
  const f = first.charAt(0);
  const l = last ? last.charAt(0) : "";

  const permutations: Permutation[] = [];

  const add = (p: string) => {
    let emailPrefix = p.replace("{first}", first).replace("{f}", f);
    if (last) {
      emailPrefix = emailPrefix.replace("{last}", last).replace("{l}", l);
    } else {
      // If no last name is provided, skip patterns that require it
      if (p.includes("{last}") || p.includes("{l}")) return;
    }
    permutations.push({ email: `${emailPrefix}@${domain}`, pattern: p });
  };

  // Single names
  add("{first}");
  if (last) {
    add("{last}");
    
    // First + Last
    add("{first}{last}");
    add("{first}.{last}");
    add("{first}_{last}");
    add("{first}-{last}");
    
    // Initial + Last
    add("{f}{last}");
    add("{f}.{last}");
    add("{f}_{last}");
    add("{f}-{last}");
    
    // First + Initial
    add("{first}{l}");
    add("{first}.{l}");
    add("{first}_{l}");
    add("{first}-{l}");
    
    // Initial + Initial
    add("{f}{l}");
    add("{f}.{l}");
    
    // Last + First
    add("{last}{first}");
    add("{last}.{first}");
    add("{last}_{first}");
    add("{last}-{first}");
    
    // Last + Initial
    add("{last}{f}");
    add("{last}.{f}");
    
    // Initial + First
    add("{l}{first}");
    add("{l}.{first}");
  }

  return permutations;
}
