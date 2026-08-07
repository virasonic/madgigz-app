export interface Ticketing {
  mode: "internal" | "external";
  url?: string;
}

export interface EventItem {
  id: string;
  title: string;
  artist: string;
  venue: string;
  city: string;
  date: string; // ISO date
  time: string;
  price: number;
  currency: "EUR";
  accentColor: string;
  category: string;
  image: string;
  capacity: number;
  sold: number;
  description: string;
  lineup: string[];
  doors: string;
  ageRestriction: string;
  rating: number;
  // Undefined/missing means internal (MadGigz-sold) - only artist-created
  // shows can currently choose "external" (e.g. linking out to Entradium).
  ticketing?: Ticketing;
}

export interface ContentPost {
  id: string;
  eventId: string;
  artist: string;
  showTitle: string;
  caption: string;
  image: string;
  // Scaffolding for real video reels later - no video assets exist yet, so
  // every current mock post is "image"; ContentReelCard already knows how to
  // render "video" once mediaType/videoUrl are populated for real.
  mediaType: "image" | "video";
  videoUrl?: string;
}

// Placeholder photography (Picsum, seeded for deterministic mock data) —
// swap for real event/artist photography once venues are onboarded.
const photo = (seed: string) => `https://picsum.photos/seed/${seed}/800/1200`;

export const events: EventItem[] = [
  {
    id: "noche-de-fuego",
    title: "Noche de Fuego",
    artist: "Los Cardenales",
    venue: "Sala But",
    city: "Madrid",
    date: "2026-08-14",
    time: "22:00",
    price: 18,
    currency: "EUR",
    accentColor: "#d76616",
    category: "Rock",
    image: photo("noche-de-fuego"),
    capacity: 400,
    sold: 372,
    description:
      "Los Cardenales bring their high-energy blend of flamenco rock back to Sala But for one night only, celebrating the release of their new EP.",
    lineup: ["Los Cardenales", "Turia", "DJ Espectro"],
    doors: "21:00",
    ageRestriction: "18+",
    rating: 4.8,
  },
  {
    id: "riviera-electronica",
    title: "Riviera Electrónica",
    artist: "Nuria Vox",
    venue: "La Riviera",
    city: "Madrid",
    date: "2026-08-16",
    time: "23:00",
    price: 25,
    currency: "EUR",
    accentColor: "#54c3bd",
    category: "Electronic",
    image: photo("riviera-electronica"),
    capacity: 2000,
    sold: 1180,
    description:
      "Nuria Vox headlines a night of deep house and techno on La Riviera's riverside terrace, with support from Madrid's up-and-coming DJ collective.",
    lineup: ["Nuria Vox", "Colectivo Sur", "Mateo Rein"],
    doors: "22:00",
    ageRestriction: "18+",
    rating: 4.6,
  },
  {
    id: "indie-nights-elsol",
    title: "Indie Nights",
    artist: "Las Ventanas",
    venue: "Sala El Sol",
    city: "Madrid",
    date: "2026-08-12",
    time: "21:30",
    price: 12,
    currency: "EUR",
    accentColor: "#0d5c6d",
    category: "Indie",
    image: photo("indie-nights-elsol"),
    capacity: 200,
    sold: 96,
    description:
      "A cozy night of dreamy guitars and analog synths in one of Madrid's oldest independent venues. Las Ventanas play their first Madrid show of the year.",
    lineup: ["Las Ventanas", "Julieta Marfil"],
    doors: "21:00",
    ageRestriction: "16+",
    rating: 4.4,
  },
  {
    id: "wizink-arena-rock",
    title: "Arena Rock Fest",
    artist: "Hierro Norte",
    venue: "WiZink Center",
    city: "Madrid",
    date: "2026-08-22",
    time: "20:30",
    price: 45,
    currency: "EUR",
    accentColor: "#73241d",
    category: "Rock",
    image: photo("wizink-arena-rock"),
    capacity: 8000,
    sold: 7650,
    description:
      "Hierro Norte's biggest headline show yet, with a full pyrotechnic stage production and support from three of Spain's heaviest touring acts.",
    lineup: ["Hierro Norte", "Cenizas", "Lobo Rojo", "Muralla"],
    doors: "19:30",
    ageRestriction: "All ages",
    rating: 4.9,
  },
  {
    id: "copernico-jazz",
    title: "Jazz de Madrugada",
    artist: "Trio Copérnico",
    venue: "Copérnico",
    city: "Madrid",
    date: "2026-08-11",
    time: "22:30",
    price: 15,
    currency: "EUR",
    accentColor: "#d76616",
    category: "Jazz",
    image: photo("copernico-jazz"),
    capacity: 120,
    sold: 41,
    description:
      "Late-night jazz in an intimate basement setting. Trio Copérnico plays original compositions alongside reworked Spanish standards.",
    lineup: ["Trio Copérnico"],
    doors: "22:00",
    ageRestriction: "18+",
    rating: 4.7,
  },
  {
    id: "caracol-hiphop",
    title: "Caracol Cypher",
    artist: "MC Deriva",
    venue: "Sala Caracol",
    city: "Madrid",
    date: "2026-08-19",
    time: "22:00",
    price: 14,
    currency: "EUR",
    accentColor: "#54c3bd",
    category: "Hip-Hop",
    image: photo("caracol-hiphop"),
    capacity: 350,
    sold: 322,
    description:
      "Madrid's underground hip-hop scene takes over Sala Caracol for a night of live cyphers, scratch sets, and guest verses.",
    lineup: ["MC Deriva", "Bloque 7", "DJ Rasca"],
    doors: "21:30",
    ageRestriction: "18+",
    rating: 4.5,
  },
  {
    id: "nazca-pop",
    title: "Pop en la Nazca",
    artist: "Aire Nuevo",
    venue: "Nazca Club",
    city: "Madrid",
    date: "2026-08-25",
    time: "21:00",
    price: 20,
    currency: "EUR",
    accentColor: "#0d5c6d",
    category: "Pop",
    image: photo("nazca-pop"),
    capacity: 600,
    sold: 600,
    description:
      "Aire Nuevo's synth-pop tour hits Nazca Club with a full light show and their biggest Madrid crowd yet.",
    lineup: ["Aire Nuevo", "Marina Cielo"],
    doors: "20:30",
    ageRestriction: "16+",
    rating: 4.6,
  },
  {
    id: "sol-acoustic",
    title: "Acústico en El Sol",
    artist: "Pablo Aguas",
    venue: "Sala El Sol",
    city: "Madrid",
    date: "2026-08-09",
    time: "20:00",
    price: 10,
    currency: "EUR",
    accentColor: "#73241d",
    category: "Singer-Songwriter",
    image: photo("sol-acoustic"),
    capacity: 200,
    sold: 74,
    description:
      "A stripped-back acoustic set from Pablo Aguas, just voice and guitar, ahead of his full-band tour next month.",
    lineup: ["Pablo Aguas"],
    doors: "19:30",
    ageRestriction: "All ages",
    rating: 4.3,
  },
];

export const contentPosts: ContentPost[] = [
  {
    id: "post-cardenales-1",
    eventId: "noche-de-fuego",
    artist: "Los Cardenales",
    showTitle: "Noche de Fuego",
    caption: "Soundcheck done. Tonight's going to be loud. 🔥",
    image: photo("post-cardenales-1"),
    mediaType: "image",
  },
  {
    id: "post-nuriavox-1",
    eventId: "riviera-electronica",
    artist: "Nuria Vox",
    showTitle: "Riviera Electrónica",
    caption: "New set, new visuals. See you on the terrace this weekend.",
    image: photo("post-nuriavox-1"),
    mediaType: "image",
  },
  {
    id: "post-hierronorte-1",
    eventId: "wizink-arena-rock",
    artist: "Hierro Norte",
    showTitle: "Arena Rock Fest",
    caption: "WiZink Center, we're bringing the whole production this time.",
    image: photo("post-hierronorte-1"),
    mediaType: "image",
  },
  {
    id: "post-airenuevo-1",
    eventId: "nazca-pop",
    artist: "Aire Nuevo",
    showTitle: "Pop en la Nazca",
    caption: "Rehearsals for the Nazca show are giving us chills already.",
    image: photo("post-airenuevo-1"),
    mediaType: "image",
  },
];
