# Card Deck Sizing

The original 52-card Regular Deck is now treated as the 2-player baseline.

Each exact player-count deck uses 26 regular cards per player:

| Players | Regular Cards | Power Cards | Curse Cards | Premium Cards | Game Cards |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 52 | 30 | 22 | 7 | 7 |
| 3 | 78 | 45 | 33 | 7 | 7 |
| 4 | 104 | 60 | 44 | 7 | 7 |
| 5 | 130 | 75 | 55 | 7 | 7 |
| 6 | 156 | 90 | 66 | 7 | 7 |
| 7 | 182 | 105 | 77 | 7 | 7 |
| 8 | 208 | 120 | 88 | 7 | 7 |
| 9 | 234 | 135 | 99 | 7 | 7 |
| 10 | 260 | 150 | 110 | 7 | 7 |

The scaling keeps the original taste of the deck:

| Original 2-player quantity | Scaling rule |
| --- | --- |
| 3-copy Power cards | 1.5 cards per player, rounded up on odd player counts |
| 2-copy Power or Curse cards | 1 card per player |
| 1-copy Power cards | 0.5 cards per player, rounded up on odd player counts |
| 1-copy Curse cards | 0.5 cards per player, with the more playable restrictions rounded up first on odd player counts |

On odd player counts, the Curse cards rounded up first are:

- Curse of the Alphabet (15+)
- Curse of the Scoring Drought (3)
- Curse of the Even Number

That keeps the larger decks proportional without overloading them with the harshest one-copy restrictions.

## Maximum Burn Check

The proportional deck sizes above are clean and faithful to the original 52-card mix, but absolute maximum card burn can be higher if every regular medal is earned and redeemed, every Power of the Swap is played, and Super Draw is played.

This maximum excludes Super Pen, because Super Pen depends on how many real penalties happen during its active range.

| Players | Proportional Regular Deck | Max Regular Burn Without Super Pen | Difference |
| --- | ---: | ---: | ---: |
| 2 | 52 | 56 | -4 |
| 3 | 78 | 84 | -6 |
| 4 | 104 | 110 | -6 |
| 5 | 130 | 138 | -8 |
| 6 | 156 | 163 | -7 |
| 7 | 182 | 192 | -10 |
| 8 | 208 | 217 | -9 |
| 9 | 234 | 245 | -11 |
| 10 | 260 | 270 | -10 |

So the exact proportional decks are excellent for keeping the intended card balance, but a true no-runout version would need a small reserve layer or a discard-recycle rule.
