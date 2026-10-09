// Guía de estilo por estación para el informe final: rasgos, neutros y acentos para ropa,
// maquillaje (sin base: depende de la piel de cada persona), cabello y metales.
// Contenido orientativo según la teoría de las 12 estaciones.

const p = (name, hex) => ({ name, hex });

export const GUIDES = Object.freeze({
  'primavera-clara': {
    traits: ['Claro', 'Cálido', 'Fresco', 'Delicado'],
    summary:
      'Te favorecen los colores claros y luminosos con un toque dorado, como recién lavados por el sol. Tu punto fuerte es la ligereza: cuanto más fresco y delicado, mejor.',
    neutrals: [p('Marfil', '#FFF4DC'), p('Crema', '#F0E1C5'), p('Beige dorado', '#D9BE94'), p('Camel claro', '#C9A46E'), p('Gris cálido claro', '#B9B0A2')],
    accents: [p('Melocotón', '#FFCBA4'), p('Coral claro', '#F7A08C'), p('Aguamarina', '#8FD9CB'), p('Verde pistacho', '#B2D88A'), p('Azul bígaro', '#8FA6E8')],
    avoidNote: 'Evita los colores muy oscuros o apagados, como el negro o el burdeos, porque endurecen tus rasgos y apagan tu luminosidad.',
    makeup: {
      blush: [p('Melocotón rosado', '#F7B79A'), p('Coral suave', '#F2998A'), p('Rosa albaricoque', '#F4A9A0')],
      lips: [p('Coral rosado', '#EE8A7D'), p('Melocotón vivo', '#EFA083'), p('Rosa cálido', '#E8848F')],
      eyeshadow: [p('Champán', '#EBD6B4'), p('Dorado claro', '#D9B978'), p('Verde agua', '#A9D6C4')],
      eyeliner: [p('Marrón dorado', '#7A5637'), p('Verde musgo claro', '#6F7F4A')],
    },
    hair: {
      best: [p('Rubio dorado claro', '#E3C489'), p('Rubio miel', '#C99B5A'), p('Rubio fresa', '#D9A377'), p('Castaño claro dorado', '#A67B4E')],
      note: 'Mantén el cabello claro y con reflejos dorados; los tonos ceniza o muy oscuros te restan luz.',
    },
    metals: { best: ['Oro amarillo', 'Oro rosa'], alsoGood: ['Latón claro', 'Oro blanco'], avoid: ['Plata envejecida', 'Bronce oscuro'] },
  },

  'primavera-calida': {
    traits: ['Cálido', 'Dorado', 'Luminoso', 'Alegre'],
    summary:
      'Tu colorido es claramente dorado y pide colores cálidos, jugosos y llenos de vida. Piensa en fruta madura y hierba al sol.',
    neutrals: [p('Marfil cálido', '#FBEFD5'), p('Camel', '#B88755'), p('Caramelo', '#A9743C'), p('Marrón dorado', '#8A5A2B'), p('Caqui claro', '#BDB38A')],
    accents: [p('Coral vivo', '#FF6F52'), p('Mandarina', '#F28A1E'), p('Verde hierba', '#6FB53A'), p('Turquesa', '#1FB5A8'), p('Rojo amapola', '#E8322A')],
    avoidNote: 'Evita los colores fríos y azulados, como el fucsia frío o el gris hielo, porque vuelven tu piel cetrina y sin vida.',
    makeup: {
      blush: [p('Melocotón intenso', '#F39C78'), p('Coral', '#F0826A'), p('Albaricoque', '#F5A873')],
      lips: [p('Coral', '#F06A55'), p('Rojo anaranjado', '#DE4B32'), p('Salmón', '#F08A70')],
      eyeshadow: [p('Dorado', '#CFA552'), p('Bronce claro', '#B98A55'), p('Verde oliva claro', '#9AA35A')],
      eyeliner: [p('Marrón cálido', '#6B4423'), p('Verde bosque cálido', '#4F6B35')],
    },
    hair: {
      best: [p('Rubio dorado', '#D6A85A'), p('Rubio cobrizo', '#C8813F'), p('Cobre claro', '#B8652F'), p('Castaño dorado', '#8E5F33')],
      note: 'Los reflejos dorados, miel y cobrizos realzan tu calidez natural; evita los rubios ceniza y el negro azulado.',
    },
    metals: { best: ['Oro amarillo', 'Latón'], alsoGood: ['Oro rosa', 'Cobre'], avoid: ['Plata', 'Platino'] },
  },

  'primavera-brillante': {
    traits: ['Brillante', 'Nítido', 'Cálido', 'Contrastado'],
    summary:
      'Tienes un colorido vivo y de alto contraste que pide colores puros y saturados con un punto cálido. Los tonos apagados te quedan pequeños.',
    neutrals: [p('Blanco cálido', '#FBF7EC'), p('Marfil', '#F6ECD4'), p('Camel claro', '#C9A46E'), p('Azul marino cálido', '#22345C'), p('Gris carbón cálido', '#4A4642')],
    accents: [p('Rojo amapola', '#E8322A'), p('Coral vivo', '#FF6F52'), p('Turquesa', '#1FB5A8'), p('Verde trébol', '#12A150'), p('Violeta vivo', '#6A3FC4')],
    avoidNote: 'Evita los colores empolvados y grisáceos, como el rosa viejo o el topo, porque te apagan y te restan vitalidad.',
    makeup: {
      blush: [p('Coral luminoso', '#F4776A'), p('Melocotón luminoso', '#F79A7C'), p('Rosa cálido intenso', '#EE6F86')],
      lips: [p('Rojo coral', '#E5433A'), p('Rosa intenso', '#F2447E'), p('Rojo cálido', '#D42A2A')],
      eyeshadow: [p('Champán luminoso', '#EFD9B0'), p('Dorado', '#D2A84C'), p('Turquesa suave', '#3FB8AE')],
      eyeliner: [p('Marrón negro', '#33261F'), p('Azul marino', '#1F2A52')],
    },
    hair: {
      best: [p('Rubio dorado luminoso', '#D9AE5E'), p('Castaño dorado', '#8E5F33'), p('Castaño oscuro cálido', '#4E3221'), p('Cobre intenso', '#A9552B')],
      note: 'Busca tonos nítidos y con brillo, claros u oscuros, siempre con reflejo cálido; evita los matices mate o ceniza.',
    },
    metals: { best: ['Oro amarillo', 'Oro pulido'], alsoGood: ['Oro rosa', 'Plata pulida'], avoid: ['Metales envejecidos', 'Bronce mate'] },
  },

  'verano-claro': {
    traits: ['Claro', 'Fresco', 'Delicado', 'Suave'],
    summary:
      'Te favorecen los colores claros, frescos y algo empolvados, como una acuarela. Tu armonía está en la suavidad, no en el contraste.',
    neutrals: [p('Blanco roto', '#F3F1EC'), p('Gris perla', '#D5D7DC'), p('Gris azulado claro', '#AEB7C2'), p('Topo rosado', '#B5A4A0'), p('Azul marino suave', '#4A5878')],
    accents: [p('Rosa palo', '#F2C4CF'), p('Azul cielo', '#A9CCEA'), p('Lavanda', '#BFB2E3'), p('Aguamarina', '#8FD9CB'), p('Azul bígaro', '#8FA6E8')],
    avoidNote: 'Evita los colores oscuros y pesados, como el negro o el chocolate, y los anaranjados intensos, porque se imponen a tu colorido delicado.',
    makeup: {
      blush: [p('Rosa suave', '#F0AEBB'), p('Rosa frío claro', '#E9A0B4'), p('Malva claro', '#DDA6BF')],
      lips: [p('Rosa palo intenso', '#E6A0AE'), p('Rosa frambuesa claro', '#D9728F'), p('Malva rosado', '#C9869F')],
      eyeshadow: [p('Rosa hielo', '#F4DDE8'), p('Gris perla', '#D5D7DC'), p('Lavanda', '#BFB2E3')],
      eyeliner: [p('Gris pizarra', '#5B6470'), p('Azul marino suave', '#4A5878')],
    },
    hair: {
      best: [p('Rubio ceniza claro', '#D8C9A8'), p('Rubio beige', '#C9B58E'), p('Rubio oscuro ceniza', '#A8977A'), p('Castaño claro ceniza', '#8C7A66')],
      note: 'Los rubios y castaños claros de matiz ceniza o beige respetan tu frescura; evita los dorados intensos y los cobrizos.',
    },
    metals: { best: ['Plata', 'Oro blanco'], alsoGood: ['Oro rosa', 'Platino'], avoid: ['Oro amarillo intenso', 'Cobre'] },
  },

  'verano-frio': {
    traits: ['Frío', 'Azulado', 'Sereno', 'Elegante'],
    summary:
      'Tu colorido es claramente frío y pide tonos azulados de intensidad media, serenos y elegantes. Piensa en el mar en un día nublado.',
    neutrals: [p('Blanco suave', '#F1F1F0'), p('Gris frío', '#85888E'), p('Gris pizarra', '#5B6470'), p('Azul marino', '#1F2A52'), p('Topo frío', '#8E8588')],
    accents: [p('Frambuesa', '#B33A68'), p('Azul pizarra', '#4F6D9C'), p('Lavanda', '#BFB2E3'), p('Rosa palo', '#F2C4CF'), p('Verde azulado', '#3F8C8A')],
    avoidNote: 'Evita los colores cálidos y anaranjados, como el mostaza o el terracota, porque amarillean tu piel y marcan las ojeras.',
    makeup: {
      blush: [p('Rosa frío', '#E28FA8'), p('Rosa malva', '#D08CA6'), p('Frambuesa suave', '#CF6F8E')],
      lips: [p('Rosa frambuesa', '#C2527A'), p('Malva', '#B56F93'), p('Rojo sandía frío', '#C9405C')],
      eyeshadow: [p('Gris azulado', '#9AA7B8'), p('Malva empolvado', '#A88A9E'), p('Azul pizarra claro', '#6D83A6')],
      eyeliner: [p('Gris carbón', '#3F444C'), p('Azul marino', '#1F2A52')],
    },
    hair: {
      best: [p('Rubio ceniza', '#B8A78A'), p('Castaño ceniza', '#7A6A5C'), p('Castaño medio frío', '#5E4E45'), p('Gris plata', '#B9BCC2')],
      note: 'Los matices ceniza y fríos son los tuyos, y las canas te sientan bien; evita los reflejos dorados, rojizos o cobrizos.',
    },
    metals: { best: ['Plata', 'Platino'], alsoGood: ['Oro blanco', 'Oro rosa'], avoid: ['Oro amarillo', 'Cobre', 'Bronce'] },
  },

  'verano-suave': {
    traits: ['Suave', 'Apagado', 'Fresco', 'Armónico'],
    summary:
      'Te favorecen los colores empolvados y grisáceos de matiz fresco, que se funden con tus rasgos sin competir con ellos. Tu elegancia está en el tono sobre tono.',
    neutrals: [p('Blanco roto', '#EFECE6'), p('Gris perla', '#D5D7DC'), p('Topo', '#8C7B70'), p('Gris frío', '#85888E'), p('Azul marino grisáceo', '#3F4A61')],
    accents: [p('Rosa viejo', '#C08A8E'), p('Malva empolvado', '#A88A9E'), p('Azul pizarra', '#4F6D9C'), p('Salvia', '#9BA58A'), p('Frambuesa apagado', '#A5536E')],
    avoidNote: 'Evita los colores muy saturados o de alto contraste, como el fucsia o el negro puro, porque te eclipsan y endurecen tus rasgos.',
    makeup: {
      blush: [p('Rosa viejo claro', '#D29AA0'), p('Malva suave', '#C894A6'), p('Rosa empolvado', '#DBA5AB')],
      lips: [p('Rosa viejo', '#C08A8E'), p('Malva rosado', '#B27690'), p('Frambuesa apagado', '#A5536E')],
      eyeshadow: [p('Topo rosado', '#B5A4A0'), p('Gris malva', '#9C8F9C'), p('Azul grisáceo', '#8A9BAA')],
      eyeliner: [p('Gris topo', '#5F5753'), p('Gris pizarra', '#5B6470')],
    },
    hair: {
      best: [p('Rubio oscuro ceniza', '#A8977A'), p('Castaño claro ceniza', '#8C7A66'), p('Castaño medio neutro', '#6B594C'), p('Rubio beige', '#C2AE8C')],
      note: 'Te sientan bien los tonos medios y mates, entre el rubio oscuro y el castaño, con matiz ceniza o beige; evita el negro y los contrastes fuertes.',
    },
    metals: { best: ['Plata mate', 'Oro blanco'], alsoGood: ['Oro rosa', 'Platino'], avoid: ['Oro amarillo brillante', 'Cobre'] },
  },

  'otono-suave': {
    traits: ['Suave', 'Apagado', 'Cálido', 'Terroso'],
    summary:
      'Te favorecen los colores terrosos y apagados con una calidez discreta, como un paisaje al atardecer. Tu armonía está en los tonos mezclados, nunca estridentes.',
    neutrals: [p('Crema', '#F0E1C5'), p('Camel', '#B88755'), p('Topo', '#8C7B70'), p('Caqui', '#A3956A'), p('Marrón suave', '#6F5646')],
    accents: [p('Salvia', '#9BA58A'), p('Oliva', '#626B32'), p('Rosa viejo', '#C08A8E'), p('Mostaza suave', '#C49A28'), p('Verde azulado apagado', '#4F8480')],
    avoidNote: 'Evita los colores muy vivos o helados, como el fucsia o el blanco óptico, porque resultan duros y te apagan el rostro.',
    makeup: {
      blush: [p('Melocotón apagado', '#DDA58E'), p('Terracota suave', '#CF8E78'), p('Rosa tostado', '#D39A93')],
      lips: [p('Rosa tostado', '#C0807A'), p('Terracota rosado', '#B9705F'), p('Nude cálido', '#C99680')],
      eyeshadow: [p('Beige dorado', '#D2BB96'), p('Topo cálido', '#9C8672'), p('Verde oliva suave', '#8C8F63')],
      eyeliner: [p('Marrón suave', '#6F5646'), p('Verde oliva', '#5C6338')],
    },
    hair: {
      best: [p('Rubio oscuro dorado', '#B5925F'), p('Castaño claro miel', '#9A7648'), p('Castaño medio cálido', '#75573C'), p('Caramelo suave', '#B08455')],
      note: 'Los tonos medios con reflejo miel o caramelo, sin grandes contrastes, son los que mejor te acompañan; evita el negro y los rubios platino.',
    },
    metals: { best: ['Oro mate', 'Oro rosa'], alsoGood: ['Bronce', 'Latón envejecido'], avoid: ['Plata brillante', 'Platino'] },
  },

  'otono-calido': {
    traits: ['Cálido', 'Dorado', 'Especiado', 'Rico'],
    summary:
      'Tu colorido es claramente dorado y pide colores cálidos, ricos y especiados, como las hojas en otoño. Cuanta más calidez, más te ilumina.',
    neutrals: [p('Crema', '#F0E1C5'), p('Camel', '#B88755'), p('Caqui', '#8A7B4F'), p('Chocolate', '#4A2C23'), p('Verde oliva oscuro', '#4B5127')],
    accents: [p('Terracota', '#A64F32'), p('Mostaza', '#C49A28'), p('Calabaza', '#D2691E'), p('Óxido', '#9A3F25'), p('Oliva', '#626B32')],
    avoidNote: 'Evita los colores fríos y azulados, como el fucsia frío, el gris hielo o el negro, porque te restan calidez y marcan las sombras.',
    makeup: {
      blush: [p('Terracota claro', '#C97B5E'), p('Melocotón tostado', '#D99272'), p('Canela', '#B9714F')],
      lips: [p('Terracota', '#A64F32'), p('Rojo ladrillo', '#A63A26'), p('Canela', '#B06A4C')],
      eyeshadow: [p('Dorado viejo', '#B8923F'), p('Bronce', '#8C6A2F'), p('Verde oliva', '#6E7438')],
      eyeliner: [p('Marrón chocolate', '#4A2C23'), p('Verde oliva oscuro', '#4B5127')],
    },
    hair: {
      best: [p('Cobre', '#A9552B'), p('Castaño dorado', '#8E5F33'), p('Caoba cálido', '#6E2F22'), p('Rubio oscuro dorado', '#B5925F')],
      note: 'Los cobrizos, caobas y castaños con reflejo dorado potencian tu calidez; evita los tonos ceniza y el negro azulado.',
    },
    metals: { best: ['Oro amarillo', 'Bronce', 'Cobre'], alsoGood: ['Latón', 'Oro rosa'], avoid: ['Plata', 'Platino'] },
  },

  'otono-profundo': {
    traits: ['Profundo', 'Cálido', 'Intenso', 'Rico'],
    summary:
      'Tienes un colorido oscuro e intenso que pide colores profundos y ricos con base cálida. Los tonos claros y lavados no están a tu altura.',
    neutrals: [p('Crema cálido', '#EADBC0'), p('Camel oscuro', '#9C6B3C'), p('Chocolate', '#4A2C23'), p('Verde bosque', '#234B38'), p('Marrón negro', '#2B1E19')],
    accents: [p('Óxido', '#9A3F25'), p('Borgoña cálido', '#71333B'), p('Petróleo', '#17636A'), p('Terracota', '#A64F32'), p('Berenjena', '#4B2A45')],
    avoidNote: 'Evita los colores pastel y los helados, como el rosa palo o el azul cielo, porque te dejan sin fuerza y resaltan las ojeras.',
    makeup: {
      blush: [p('Terracota profundo', '#B86A52'), p('Canela', '#A9654A'), p('Rosa ladrillo', '#B8615C')],
      lips: [p('Rojo ladrillo', '#9B2F22'), p('Borgoña cálido', '#71333B'), p('Marrón rojizo', '#8A4636')],
      eyeshadow: [p('Bronce', '#8C6A2F'), p('Marrón chocolate', '#5A3A2B'), p('Verde bosque suave', '#3C5A45')],
      eyeliner: [p('Marrón negro', '#2B1E19'), p('Verde bosque oscuro', '#1E3B2D')],
    },
    hair: {
      best: [p('Castaño oscuro cálido', '#4E3221'), p('Castaño chocolate', '#3B241B'), p('Caoba', '#5E2A22'), p('Castaño rojizo', '#6B3A26')],
      note: 'Los castaños oscuros, chocolates y caobas con reflejo cálido encajan con tu profundidad; evita los rubios claros y los tonos ceniza.',
    },
    metals: { best: ['Oro amarillo', 'Bronce'], alsoGood: ['Cobre', 'Oro envejecido'], avoid: ['Plata clara', 'Platino'] },
  },

  'invierno-profundo': {
    traits: ['Profundo', 'Frío', 'Intenso', 'Contrastado'],
    summary:
      'Tienes un colorido oscuro e intenso que pide colores profundos y fríos, con mucho contraste. El negro es tu aliado natural.',
    neutrals: [p('Blanco puro', '#FAFAF8'), p('Negro', '#171719'), p('Gris carbón', '#3A3D42'), p('Azul marino', '#1F2A52'), p('Marrón negro frío', '#2E2424')],
    accents: [p('Granate', '#7B1630'), p('Ciruela', '#63345D'), p('Esmeralda frío', '#08785B'), p('Petróleo', '#17636A'), p('Berenjena', '#4B2A45')],
    avoidNote: 'Evita los colores claros y cálidos apagados, como el camel, el melocotón o el mostaza, porque te vuelven la piel amarillenta y sin fuerza.',
    makeup: {
      blush: [p('Rosa ciruela', '#B5607F'), p('Frambuesa profundo', '#B04468'), p('Rosa frío intenso', '#C9597F')],
      lips: [p('Granate', '#7B1630'), p('Rojo frío profundo', '#A3122C'), p('Ciruela rojizo', '#7A2F5C')],
      eyeshadow: [p('Gris carbón', '#4A4D55'), p('Ciruela', '#63345D'), p('Topo frío', '#8E8588')],
      eyeliner: [p('Negro', '#171719'), p('Azul marino profundo', '#17203F')],
    },
    hair: {
      best: [p('Negro', '#171719'), p('Castaño muy oscuro frío', '#2E2322'), p('Castaño oscuro neutro', '#3F302B'), p('Negro azulado', '#14161F')],
      note: 'Los tonos muy oscuros y de matiz frío o neutro mantienen tu contraste natural; evita los rubios y los reflejos dorados o cobrizos.',
    },
    metals: { best: ['Plata', 'Platino'], alsoGood: ['Oro blanco', 'Acero oscuro'], avoid: ['Oro amarillo', 'Cobre', 'Bronce'] },
  },

  'invierno-frio': {
    traits: ['Frío', 'Helado', 'Nítido', 'Contrastado'],
    summary:
      'Tu colorido es claramente frío y pide colores azulados, nítidos y de alto contraste, como joyas sobre nieve. Nada de calidez: lo tuyo es el hielo.',
    neutrals: [p('Blanco óptico', '#F8F8F5'), p('Negro', '#171719'), p('Gris frío', '#85888E'), p('Gris carbón', '#3A3D42'), p('Azul marino', '#1F2A52')],
    accents: [p('Cobalto', '#2449A8'), p('Fucsia frío', '#C21870'), p('Esmeralda frío', '#08785B'), p('Rojo cereza', '#C1122F'), p('Rosa hielo', '#F4DDE8')],
    avoidNote: 'Evita los colores cálidos y terrosos, como el naranja, el mostaza o el camel, porque chocan con tu subtono y te apagan.',
    makeup: {
      blush: [p('Rosa frío', '#E07FA3'), p('Fucsia suave', '#D65C93'), p('Rosa helado', '#EBA6C0')],
      lips: [p('Rojo cereza', '#C1122F'), p('Fucsia', '#C21870'), p('Frambuesa', '#B33A68')],
      eyeshadow: [p('Gris plata', '#B9BCC2'), p('Gris carbón', '#4A4D55'), p('Azul noche', '#2A3766')],
      eyeliner: [p('Negro', '#171719'), p('Azul marino', '#1F2A52')],
    },
    hair: {
      best: [p('Negro', '#171719'), p('Castaño oscuro ceniza', '#3A2F2C'), p('Castaño medio frío', '#5E4E45'), p('Gris plata', '#B9BCC2')],
      note: 'Los tonos oscuros de matiz ceniza y las canas plateadas te favorecen mucho; evita cualquier reflejo dorado, rojizo o cobrizo.',
    },
    metals: { best: ['Plata', 'Platino', 'Oro blanco'], alsoGood: ['Acero'], avoid: ['Oro amarillo', 'Cobre', 'Bronce'] },
  },

  'invierno-brillante': {
    traits: ['Brillante', 'Nítido', 'Frío', 'Contrastado'],
    summary:
      'Tienes un colorido vivo y de máximo contraste que pide colores puros, saturados y fríos. Atrévete: los tonos tímidos no te hacen justicia.',
    neutrals: [p('Blanco óptico', '#F8F8F5'), p('Negro', '#171719'), p('Gris carbón', '#3A3D42'), p('Azul marino', '#1F2A52'), p('Gris hielo', '#DDE1E6')],
    accents: [p('Fucsia frío', '#C21870'), p('Cobalto', '#2449A8'), p('Rojo cereza', '#C1122F'), p('Verde trébol', '#12A150'), p('Violeta vivo', '#6A3FC4')],
    avoidNote: 'Evita los colores apagados y terrosos, como el salvia, el topo o el camel, porque te apagan y difuminan tu contraste natural.',
    makeup: {
      blush: [p('Rosa vivo', '#EC5F8E'), p('Fucsia suave', '#D65C93'), p('Rosa frío luminoso', '#EE8FB0')],
      lips: [p('Rojo cereza', '#C1122F'), p('Fucsia', '#C21870'), p('Rosa intenso', '#F2447E')],
      eyeshadow: [p('Blanco hielo', '#EEF0F3'), p('Gris plata', '#B9BCC2'), p('Violeta', '#6F52B5')],
      eyeliner: [p('Negro', '#171719'), p('Cobalto', '#2449A8')],
    },
    hair: {
      best: [p('Negro', '#171719'), p('Negro azulado', '#14161F'), p('Castaño oscuro frío', '#3A2B28'), p('Castaño medio brillante', '#5A4238')],
      note: 'Busca tonos oscuros, nítidos y con mucho brillo para mantener el contraste con tu piel; evita los matices mate, dorados o desteñidos.',
    },
    metals: { best: ['Plata pulida', 'Platino'], alsoGood: ['Oro blanco', 'Oro amarillo pulido'], avoid: ['Bronce', 'Metales envejecidos'] },
  },
});
