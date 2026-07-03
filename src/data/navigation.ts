export interface NavItem {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

export const mainNav: NavItem[] = [
  { label: 'Home', href: '/' },
  {
    label: 'Nummer',
    href: '/telefoonnummers/',
    children: [
      { label: '020 201 2901', href: '/020-201-2901/' },
      { label: '31887751713', href: '/31887751713/' },
      { label: '085-7604586', href: '/085-7604586/' },
      { label: '070-2040084', href: '/070-2040084/' },
      { label: '31-614094100', href: '/31-614094100/' },
      { label: '31302061149', href: '/31302061149/' },
      { label: '0800 1134', href: '/0800-1134/' },
      { label: '043-5690200', href: '/043-5690200/' },
      { label: '307125772', href: '/307125772/' },
      { label: '085 018 99 98', href: '/085-018-99-98/' },
    ],
  },
  { label: 'Updates', href: '/updates/' },
  { label: 'Over ons', href: '/over-ons/' },
];
