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
    images?: { label?: string; url?: string }[];
    videos?: { label?: string; url?: string }[];
    audio?: string;
  };
  tags?: string[];
  sources?: string[];
};
