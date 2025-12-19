export type Place = {
  id?: string;
  slug?: string;
  title: string;
  country?: string;
  city?: string;
  coords: [number, number];
  dateStart?: string;
  dateEnd?: string;
  periodLabel?: string;
  levelTexts?: {
    primary?: string;
    secondary?: string;
    high?: string;
  };
  media?: {
    cover?: string;
    gallery?: string[];
  };
  tags?: string[];
  sources?: string[];
};
