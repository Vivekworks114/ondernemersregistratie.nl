export interface BusinessCategory {
  name: string;
  icon: string;
  href: string;
}

export const businessCategories: BusinessCategory[] = [
  { name: 'Aannemer', icon: '/images/icons/pixelarticons_user.png', href: '#' },
  { name: 'Accountant', icon: '/images/icons/pixelarticons_calculator.png', href: '#' },
  { name: 'B&B', icon: '/images/icons/pixelarticons_bed.png', href: '#' },
  { name: 'Bouwbedrijf', icon: '/images/icons/pixelarticons_building-community.png', href: '#' },
  { name: 'Fotograaf', icon: '/images/icons/pixelarticons_camera.png', href: '#' },
  { name: 'Garage', icon: '/images/icons/pixelarticons_car.png', href: '#' },
  { name: 'IT-consultancy', icon: '/images/icons/pixelarticons_device-laptop.png', href: '#' },
  { name: 'Kapper', icon: '/images/icons/pixelarticons_cut.png', href: '#' },
  { name: 'Nagelstudio', icon: '/images/icons/pixelarticons_colors-swatch.png', href: '#' },
  { name: 'Restaurant', icon: '/images/icons/pixelarticons_cocktail.png', href: '#' },
  { name: 'Slagerij', icon: '/images/icons/pixelarticons_bullseye.png', href: '#' },
  { name: 'Supermarkt', icon: '/images/icons/pixelarticons_cart.png', href: '#' },
];
