/**
 * Icon Management Module
 *
 * Integrates with Fluent UI System Icons for entity icon management.
 * Fetches SVG icons from GitHub and uploads them as web resources.
 */

export interface IconSuggestion {
  name: string;
  fileName: string;
  url: string;
  category: string;
}

export interface IconUploadResult {
  webResourceId: string;
  webResourceName: string;
  iconVectorName: string;
  success: boolean;
  error?: string;
}

/**
 * Fluent UI System Icons configuration
 */
const FLUENT_ICONS_CONFIG = {
  baseUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-system-icons/main/assets',
  defaultSize: 24,
  defaultStyle: 'filled'
};

/**
 * Icon suggestions based on entity type/name
 */
const ICON_SUGGESTIONS: Record<string, IconSuggestion[]> = {
  // People & Organizations
  contact: [
    { name: 'Person', fileName: 'person_24_filled.svg', url: '', category: 'people' },
    { name: 'People', fileName: 'people_24_filled.svg', url: '', category: 'people' }
  ],
  account: [
    { name: 'Building', fileName: 'building_24_filled.svg', url: '', category: 'places' },
    { name: 'Organization', fileName: 'organization_24_filled.svg', url: '', category: 'people' }
  ],
  customer: [
    { name: 'Person Circle', fileName: 'person_circle_24_filled.svg', url: '', category: 'people' }
  ],

  // Business
  opportunity: [
    { name: 'Money', fileName: 'money_24_filled.svg', url: '', category: 'commerce' },
    { name: 'Target', fileName: 'target_24_filled.svg', url: '', category: 'general' }
  ],
  quote: [
    { name: 'Document', fileName: 'document_24_filled.svg', url: '', category: 'document' },
    { name: 'Document Text', fileName: 'document_text_24_filled.svg', url: '', category: 'document' }
  ],
  order: [
    { name: 'Cart', fileName: 'cart_24_filled.svg', url: '', category: 'commerce' },
    { name: 'Receipt', fileName: 'receipt_24_filled.svg', url: '', category: 'commerce' }
  ],
  invoice: [
    { name: 'Receipt Money', fileName: 'receipt_money_24_filled.svg', url: '', category: 'commerce' }
  ],
  product: [
    { name: 'Box', fileName: 'box_24_filled.svg', url: '', category: 'commerce' },
    { name: 'Cube', fileName: 'cube_24_filled.svg', url: '', category: 'general' }
  ],

  // Cases & Service
  case: [
    { name: 'Question Circle', fileName: 'question_circle_24_filled.svg', url: '', category: 'general' },
    { name: 'Chat Help', fileName: 'chat_help_24_filled.svg', url: '', category: 'communication' }
  ],
  incident: [
    { name: 'Alert', fileName: 'alert_24_filled.svg', url: '', category: 'general' },
    { name: 'Warning', fileName: 'warning_24_filled.svg', url: '', category: 'general' }
  ],
  ticket: [
    { name: 'Ticket', fileName: 'ticket_24_filled.svg', url: '', category: 'general' }
  ],

  // Tasks & Activities
  task: [
    { name: 'Task List', fileName: 'task_list_24_filled.svg', url: '', category: 'productivity' },
    { name: 'Checkmark', fileName: 'checkmark_24_filled.svg', url: '', category: 'general' }
  ],
  appointment: [
    { name: 'Calendar', fileName: 'calendar_24_filled.svg', url: '', category: 'productivity' },
    { name: 'Calendar Clock', fileName: 'calendar_clock_24_filled.svg', url: '', category: 'productivity' }
  ],
  email: [
    { name: 'Mail', fileName: 'mail_24_filled.svg', url: '', category: 'communication' },
    { name: 'Mail Inbox', fileName: 'mail_inbox_24_filled.svg', url: '', category: 'communication' }
  ],
  phonecall: [
    { name: 'Call', fileName: 'call_24_filled.svg', url: '', category: 'communication' },
    { name: 'Phone', fileName: 'phone_24_filled.svg', url: '', category: 'communication' }
  ],

  // Reference Data
  category: [
    { name: 'Tag', fileName: 'tag_24_filled.svg', url: '', category: 'general' },
    { name: 'Grid', fileName: 'grid_24_filled.svg', url: '', category: 'general' }
  ],
  status: [
    { name: 'Status', fileName: 'status_24_filled.svg', url: '', category: 'general' },
    { name: 'Circle', fileName: 'circle_24_filled.svg', url: '', category: 'shapes' }
  ],
  type: [
    { name: 'Options', fileName: 'options_24_filled.svg', url: '', category: 'general' }
  ],
  reason: [
    { name: 'Info', fileName: 'info_24_filled.svg', url: '', category: 'general' }
  ],

  // Documents & Files
  document: [
    { name: 'Document', fileName: 'document_24_filled.svg', url: '', category: 'document' },
    { name: 'Document Text', fileName: 'document_text_24_filled.svg', url: '', category: 'document' }
  ],
  file: [
    { name: 'Document', fileName: 'document_24_filled.svg', url: '', category: 'document' }
  ],
  attachment: [
    { name: 'Attach', fileName: 'attach_24_filled.svg', url: '', category: 'document' }
  ],
  note: [
    { name: 'Note', fileName: 'note_24_filled.svg', url: '', category: 'document' },
    { name: 'Document Edit', fileName: 'document_edit_24_filled.svg', url: '', category: 'document' }
  ],

  // Locations
  location: [
    { name: 'Location', fileName: 'location_24_filled.svg', url: '', category: 'places' },
    { name: 'Pin', fileName: 'pin_24_filled.svg', url: '', category: 'places' }
  ],
  address: [
    { name: 'Location', fileName: 'location_24_filled.svg', url: '', category: 'places' },
    { name: 'Home', fileName: 'home_24_filled.svg', url: '', category: 'places' }
  ],

  // Projects & Work
  project: [
    { name: 'Briefcase', fileName: 'briefcase_24_filled.svg', url: '', category: 'productivity' },
    { name: 'Folder', fileName: 'folder_24_filled.svg', url: '', category: 'document' }
  ],
  application: [
    { name: 'Apps', fileName: 'apps_24_filled.svg', url: '', category: 'general' },
    { name: 'Window', fileName: 'window_24_filled.svg', url: '', category: 'general' }
  ],

  // Default fallback
  default: [
    { name: 'Circle', fileName: 'circle_24_filled.svg', url: '', category: 'shapes' },
    { name: 'Square', fileName: 'square_24_filled.svg', url: '', category: 'shapes' },
    { name: 'Star', fileName: 'star_24_filled.svg', url: '', category: 'shapes' }
  ]
};

/**
 * Icon Manager Class
 */
export class IconManager {
  private baseUrl: string;
  private cache: Map<string, string> = new Map();

  constructor() {
    this.baseUrl = FLUENT_ICONS_CONFIG.baseUrl;
  }

  /**
   * Suggest icons based on entity name or type
   */
  suggestIcons(entityName: string): IconSuggestion[] {
    const lowerName = entityName.toLowerCase()
      .replace(/^sic_/, '')     // Remove publisher prefix
      .replace(/^ref_/, '');     // Remove ref data infix

    // Try exact match first
    if (ICON_SUGGESTIONS[lowerName]) {
      return this.populateUrls(ICON_SUGGESTIONS[lowerName]);
    }

    // Try partial match
    for (const [key, suggestions] of Object.entries(ICON_SUGGESTIONS)) {
      if (lowerName.includes(key) || key.includes(lowerName)) {
        return this.populateUrls(suggestions);
      }
    }

    // Return default suggestions
    return this.populateUrls(ICON_SUGGESTIONS.default);
  }

  /**
   * Populate full URLs for icon suggestions
   */
  private populateUrls(suggestions: IconSuggestion[]): IconSuggestion[] {
    return suggestions.map(s => {
      try {
        const iconPath = this.constructFluentIconPath(s.fileName);
        return {
          ...s,
          url: `${this.baseUrl}/${iconPath}`
        };
      } catch (error) {
        // If path construction fails, return suggestion with empty URL
        return {
          ...s,
          url: ''
        };
      }
    });
  }

  /**
   * Parse icon filename and construct GitHub path
   * Converts: people_community_24_filled.svg
   * To: assets/People Community/SVG/ic_fluent_people_community_24_filled.svg
   */
  private constructFluentIconPath(fileName: string): string {
    // Remove .svg extension
    const base = fileName.replace('.svg', '');

    // Split into parts
    const parts = base.split('_');

    // Extract size (e.g., '24') and style (e.g., 'filled' or 'regular')
    const size = parts[parts.length - 2];
    const style = parts[parts.length - 1];

    // Validate size and style
    if (!size || !style || isNaN(parseInt(size))) {
      throw new Error(`Invalid icon filename format: ${fileName}. Expected format: {icon_name}_{size}_{style}.svg (e.g., people_community_24_filled.svg)`);
    }

    // Icon name is everything before size and style
    const iconNameParts = parts.slice(0, -2);

    if (iconNameParts.length === 0) {
      throw new Error(`Invalid icon filename format: ${fileName}. Missing icon name.`);
    }

    // Folder name: capitalize each word, join with space
    const folderName = iconNameParts
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Full filename with ic_fluent_ prefix
    const fullFileName = `ic_fluent_${base}.svg`;

    // Construct the full path
    const path = `${folderName}/SVG/${fullFileName}`;

    return path;
  }

  /**
   * Fetch SVG icon from Fluent UI GitHub repository
   */
  async fetchIcon(fileName: string): Promise<string> {
    // Check cache first
    if (this.cache.has(fileName)) {
      return this.cache.get(fileName)!;
    }

    try {
      // Construct the correct GitHub path
      const iconPath = this.constructFluentIconPath(fileName);
      const url = `${this.baseUrl}/${iconPath}`;

      // Use global fetch if available (Node 18+)
      const response = await global.fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch icon from GitHub: ${response.status} ${response.statusText}. URL: ${url}`);
      }

      const svg = await response.text();

      // Validate it's an SVG
      if (!svg.includes('<svg')) {
        throw new Error('Fetched content is not a valid SVG');
      }

      // Cache the result
      this.cache.set(fileName, svg);

      return svg;
    } catch (error) {
      throw new Error(`Failed to fetch icon '${fileName}': ${error instanceof Error ? error.message : String(error)}\n\nExpected format: {icon_name}_{size}_{style}.svg (e.g., people_community_24_filled.svg)\nBrowse icons at: https://github.com/microsoft/fluentui-system-icons`);
    }
  }

  /**
   * Generate web resource name for icon
   */
  generateWebResourceName(entitySchemaName: string, iconName: string): string {
    const prefix = 'sic_';
    const cleanEntityName = entitySchemaName.toLowerCase().replace(/^sic_/, '');
    const cleanIconName = iconName.toLowerCase().replace(/\s+/g, '_');

    return `${prefix}${cleanEntityName}_icon_${cleanIconName}`;
  }

  /**
   * Generate icon vector name for EntityMetadata
   * Uses $webresource: directive which is the correct syntax for Dynamics 365
   * This creates a solution dependency and tells the system to look up the web resource by name
   */
  generateIconVectorName(webResourceName: string): string {
    return `$webresource:${webResourceName}`;
  }

  /**
   * Validate icon SVG content
   */
  validateIconSvg(svg: string): { valid: boolean; error?: string } {
    if (!svg.includes('<svg')) {
      return { valid: false, error: 'Content is not a valid SVG' };
    }

    if (svg.length > 100000) {
      return { valid: false, error: 'SVG file is too large (max 100KB)' };
    }

    // Check for script tags (security)
    if (svg.includes('<script')) {
      return { valid: false, error: 'SVG contains script tags (security risk)' };
    }

    return { valid: true };
  }

  /**
   * Get all available icon categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const suggestions of Object.values(ICON_SUGGESTIONS)) {
      suggestions.forEach(s => categories.add(s.category));
    }
    return Array.from(categories).sort();
  }

  /**
   * Search icons by name
   */
  searchIcons(searchTerm: string): IconSuggestion[] {
    const results: IconSuggestion[] = [];
    const lowerSearch = searchTerm.toLowerCase();

    for (const suggestions of Object.values(ICON_SUGGESTIONS)) {
      for (const suggestion of suggestions) {
        if (
          suggestion.name.toLowerCase().includes(lowerSearch) ||
          suggestion.fileName.toLowerCase().includes(lowerSearch)
        ) {
          results.push(this.populateUrls([suggestion])[0]);
        }
      }
    }

    return results;
  }

  /**
   * Get icons by category
   */
  getIconsByCategory(category: string): IconSuggestion[] {
    const results: IconSuggestion[] = [];

    for (const suggestions of Object.values(ICON_SUGGESTIONS)) {
      for (const suggestion of suggestions) {
        if (suggestion.category === category) {
          results.push(this.populateUrls([suggestion])[0]);
        }
      }
    }

    return results;
  }

  /**
   * Build custom icon URL for specific size/style
   */
  buildIconUrl(iconName: string, size: number = 24, style: 'filled' | 'regular' = 'filled'): string {
    const fileName = `${iconName}_${size}_${style}.svg`;
    try {
      const iconPath = this.constructFluentIconPath(fileName);
      return `${this.baseUrl}/${iconPath}`;
    } catch (error) {
      throw new Error(`Failed to build icon URL for '${iconName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear icon cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const iconManager = new IconManager();
