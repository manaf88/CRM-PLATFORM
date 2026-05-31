export type BrandServiceItem = {
  name: string;
  description?: string | null;
  priceRange?: string | null;
};

export type BrandOfferItem = {
  title: string;
  description?: string | null;
  validUntil?: string | null;
};

export type BrandColorItem = {
  name?: string | null;
  hex: string;
};

export type BrandLanguage = 'ar' | 'en' | 'fr' | 'de';