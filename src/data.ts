import { DesignConcept, DesignStyle, ShoppingItem } from "./types";

export const styles: DesignStyle[] = [
  { id: "modern", name: "Modern", subtitle: "Clean lines x warm contrast", colors: ["#D8CFC0", "#262923", "#F5F2EA"], icon: "grid-outline" },
  { id: "contemporary", name: "Contemporary", subtitle: "Current x sculptural x calm", colors: ["#B8A99A", "#788078", "#F4F0E8"], icon: "sparkles-outline" },
  { id: "traditional", name: "Traditional", subtitle: "Tailored x timeless x layered", colors: ["#6F4E37", "#B69B74", "#E9E0CF"], icon: "library-outline" },
  { id: "midcentury", name: "Mid-Century Modern", subtitle: "Iconic x warm x optimistic", colors: ["#C46F3B", "#48645A", "#E8D5B5"], icon: "ellipse-outline" },
  { id: "transitional", name: "Transitional", subtitle: "Classic x edited x comfortable", colors: ["#A89C8D", "#4E5B57", "#EEE9E1"], icon: "swap-horizontal-outline" },
  { id: "artdeco", name: "Art Deco", subtitle: "Glamorous x geometric x rich", colors: ["#C8A45D", "#173D3A", "#F2E8D5"], icon: "diamond-outline" },
  { id: "organic", name: "Organic Modern", subtitle: "Natural x soft x grounded", colors: ["#8A9478", "#C4AA88", "#EEE9DE"], icon: "leaf-outline" },
  { id: "scandinavian", name: "Scandinavian", subtitle: "Airy x useful x inviting", colors: ["#D7C8AE", "#AEB7AE", "#FAF8F2"], icon: "sunny-outline" },
  { id: "japandi", name: "Japandi", subtitle: "Quiet x crafted x minimal", colors: ["#8A7561", "#C9B99F", "#E8E2D7"], icon: "remove-outline" },
  { id: "coastal", name: "Coastal", subtitle: "Breezy x relaxed x luminous", colors: ["#A8C4C9", "#547A87", "#F3EFE4"], icon: "water-outline" },
  { id: "industrial", name: "Industrial", subtitle: "Raw x urban x functional", colors: ["#8B8178", "#3C4140", "#D8C6AA"], icon: "construct-outline" },
  { id: "bohemian", name: "Bohemian", subtitle: "Collected x colorful x soulful", colors: ["#B96845", "#7B7751", "#E9D2B7"], icon: "flower-outline" },
  { id: "frenchcountry", name: "French Country", subtitle: "Romantic x rustic x refined", colors: ["#9BA79A", "#6D7B8B", "#EFE4D2"], icon: "home-outline" }
];

const catalog: ShoppingItem[] = [
  { id: "sofa", name: "Performance linen sofa", category: "Furniture", description: "84-inch, warm ivory upholstery", quantity: 1, unitPrice: 1299, retailer: "Article", purchaseUrl: "https://www.article.com/search?q=ivory%20sofa" },
  { id: "chairs", name: "Oak accent chair", category: "Furniture", description: "Natural oak frame, woven seat", quantity: 2, unitPrice: 329, retailer: "West Elm", purchaseUrl: "https://www.westelm.com/search/results.html?words=oak%20accent%20chair" },
  { id: "table", name: "Travertine coffee table", category: "Furniture", description: "Rounded 40-inch profile", quantity: 1, unitPrice: 549, retailer: "CB2", purchaseUrl: "https://www.cb2.com/search?query=travertine%20coffee%20table" },
  { id: "rug", name: "Handwoven wool rug", category: "Textiles", description: "8 x 10 ft, oatmeal", quantity: 1, unitPrice: 489, retailer: "Rugs USA", purchaseUrl: "https://www.rugsusa.com/search?q=oatmeal%20wool%20rug" },
  { id: "lamp", name: "Linen floor lamp", category: "Lighting", description: "Aged brass with linen shade", quantity: 1, unitPrice: 219, retailer: "Lamps Plus", purchaseUrl: "https://www.lampsplus.com/products/?q=linen%20floor%20lamp" },
  { id: "paint", name: "Interior wall paint", category: "Finishes", description: "2 gallons, warm soft white", quantity: 2, unitPrice: 59, retailer: "The Home Depot", purchaseUrl: "https://www.homedepot.com/s/interior%20paint%20warm%20white" },
  { id: "curtains", name: "Linen curtain panels", category: "Textiles", description: "96-inch, natural flax", quantity: 2, unitPrice: 89, retailer: "Pottery Barn", purchaseUrl: "https://www.potterybarn.com/search/results.html?words=linen%20curtain" },
  { id: "art", name: "Textured wall art", category: "Decor", description: "Neutral 36 x 48-inch canvas", quantity: 1, unitPrice: 198, retailer: "Etsy", purchaseUrl: "https://www.etsy.com/search?q=neutral%20textured%20wall%20art" }
];

export function demoConcept(style: DesignStyle): DesignConcept {
  return {
    id: String(Date.now()),
    title: `${style.name} Sanctuary`,
    summary: `A composed ${style.name.toLowerCase()} room with a clearer conversation zone, warmer lighting, and tactile natural materials. The plan keeps circulation open and gives every purchase a purpose.`,
    style: style.name,
    palette: style.colors,
    principles: ["Anchor the room with one generous rug", "Repeat natural wood in three places", "Layer ambient and task lighting"],
    shoppingItems: catalog.map(item => ({ ...item }))
  };
}