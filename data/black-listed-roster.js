/**
 * Edit this list to update the Black-Listed roster on the site.
 * teamRank (#1 = strongest overall): TrustGod, KK, Zofia, FuZiveer, Dis, Horde
 * peakRank — optional string (e.g. "Diamond 1", "Champion") + icon in More popup rail
 * peakRankIconId — optional 0–36 to override auto icon from peakRank label
 */
window.BLACK_LISTED_ROSTER = [
    {
        id: 'fuziveer',
        name: 'FuZiveer.BL',
        role: 'Fragger / Intel',
        teamRank: 4,
        peakRank: 'Diamond 1',
        attackers: ['Solid Snake', 'Twitch'],
        defenders: ['Solis', 'Lesion'],
    },
    {
        id: 'dis',
        name: 'Dis.BL',
        role: 'Support / Intel',
        teamRank: 5,
        peakRank: 'Platinum 1',
        attackers: ['Thatcher', 'Lion'],
        defenders: ['Thorn', 'Lesion'],
    },
    {
        id: 'trustgod',
        name: 'TrustGod.BL',
        role: 'Fragger / Flex',
        teamRank: 1,
        peakRank: 'Emerald 4',
        attackers: ['Ash', 'Solid Snake'],
        defenders: ['Vigil', 'Solis'],
        igl: true,
        gridCenter: true,
    },
    {
        id: 'kk',
        name: 'KK.BL',
        role: 'Support',
        coIgl: true,
        teamRank: 2,
        peakRank: 'Emerald 4',
        attackers: ['Thermite', 'Nomad'],
        defenders: ['Castle', 'Azami'],
    },
    {
        id: 'zofia',
        name: 'Zofia.BL',
        role: 'Flex / Support',
        teamRank: 3,
        peakRank: 'Diamond 2',
        attackers: ['Blitz', 'Zofia'],
        defenders: ['Smoke', 'Ela'],
    },
    {
        id: 'horde',
        name: 'Horde.BL',
        role: 'Support',
        teamRank: 6,
        peakRank: 'Emerald 5',
        attackers: ['Ace', 'Thermite'],
        defenders: ['Kapkan', 'Frost'],
        substitute: true,
    },
];
