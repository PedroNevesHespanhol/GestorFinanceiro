const CATEGORY_MAP: Record<string, string> = {
  // Nível 1
  Income: 'Receita',
  'Loans and Financing': 'Empréstimos e Financiamentos',
  Investments: 'Investimentos',
  'Same person transfer': 'Transferência própria',
  Transfers: 'Transferências',
  'Legal obligations': 'Obrigações legais',
  Services: 'Serviços',
  Shopping: 'Compras',
  'Digital services': 'Serviços digitais',
  Groceries: 'Supermercado',
  'Food and drinks': 'Alimentação',
  Travel: 'Viagem',
  Donations: 'Doações',
  Gambling: 'Apostas',
  Taxes: 'Impostos',
  'Bank fees': 'Tarifas bancárias',
  Housing: 'Moradia',
  Healthcare: 'Saúde',
  Transportation: 'Transporte',
  Insurance: 'Seguros',
  Leisure: 'Lazer',
  Other: 'Outros',

  // Receita
  Salary: 'Salário',
  Retirement: 'Aposentadoria',
  'Entrepreneurial activities': 'Atividades empreendedoras',
  'Government aid': 'Auxílio governamental',
  'Non-recurring income': 'Receita não recorrente',

  // Empréstimos e Financiamentos
  'Late payment and overdraft costs': 'Multas e juros de atraso',
  'Interests charged': 'Juros cobrados',
  Loans: 'Empréstimos',
  Financing: 'Financiamentos',

  // Investimentos
  'Automatic investment': 'Investimento automático',
  'Fixed income': 'Renda fixa',
  'Mutual funds': 'Fundos de investimento',
  'Variable income': 'Renda variável',
  Margin: 'Margem',
  'Proceeds interests and dividends': 'Juros e dividendos',
  Pension: 'Previdência',

  // Transferências
  'Transfer - Bank slip (Boleto)': 'Boleto',
  'Transfer - Cash': 'Saque / Dinheiro',
  'Transfer - Check': 'Cheque',
  'Transfer - DOC': 'DOC',
  'Transfer - Foreign exchange': 'Câmbio',
  'Transfer - Internal': 'Transferência interna',
  'Transfer - PIX': 'PIX',
  'Transfer - TED': 'TED',
  'Credit card payment': 'Pagamento de cartão',
  'Third-party transfers': 'Transferência para terceiros',

  // Serviços
  Telecommunications: 'Telecomunicações',
  Education: 'Educação',
  'Wellness and fitness': 'Bem-estar e academia',
  Tickets: 'Ingressos',

  // Compras
  'Online shopping': 'Compras online',
  Electronics: 'Eletrônicos',
  'Pet supplies and vet': 'Pet shop e veterinário',
  Clothing: 'Roupas e acessórios',
  'Kids and toys': 'Infantil e brinquedos',
  Bookstore: 'Livraria',
  'Sports goods': 'Artigos esportivos',
  'Office Supplies': 'Material de escritório',
  Cashback: 'Cashback',

  // Serviços digitais
  Gaming: 'Games',
  'Video streaming': 'Streaming de vídeo',
  'Music streaming': 'Streaming de música',

  // Alimentação
  'Eating out': 'Restaurantes',
  'Food delivery': 'Delivery de comida',

  // Viagem
  'Airport and airlines': 'Aeroporto e companhias aéreas',
  Accommodation: 'Hospedagem',
  'Mileage programs': 'Programas de milhas',
  'Bus tickets': 'Passagens de ônibus',

  // Transporte
  'Taxi/ride-hailing': 'Táxi / Aplicativo',
  'Public transportation': 'Transporte público',
  'Car rental': 'Aluguel de veículo',
  Bicycle: 'Bicicleta',
  Automotive: 'Automotivo',

  // Moradia
  Rent: 'Aluguel',
  Houseware: 'Casa e decoração',
  'Urban land and building tax': 'IPTU',
  Utilities: 'Contas de casa',

  // Saúde
  Pharmacy: 'Farmácia',
  Medical: 'Médico / Clínica',
  Dental: 'Dentista',

  // Lazer
  Entertainment: 'Entretenimento',
  Sports: 'Esportes',
};

export function translateCategory(category: string | undefined | null): string {
  if (!category) return 'Outros';
  return CATEGORY_MAP[category] ?? category;
}
