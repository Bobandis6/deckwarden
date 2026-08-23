# Multi-TCG Deck-Building Website Feature Plan

**Primary games:** Magic: The Gathering, One Piece Card Game, and Azuki TCG  
**Planning snapshot:** August 23, 2026

## Product Direction

The strongest direction is not simply “Moxfield for three games.” It should be a **leader-first deck lab**:

> Pick your Commander or Leader, see what performs, understand why, and build your own version.

The flagship experience should take someone from selecting a single Commander, Leader, or Leader/Gate combination to having a legal and personalized deck in only a few minutes.

The platform should combine:

- Fast manual deck building
- Powerful card search
- Evidence-backed recommendations
- Tournament and community deck discovery
- Combo and synergy analysis
- Game-specific deck health statistics
- Deck publishing and social features
- Collection and budget-aware building

## What to Borrow—and Improve

| Inspiration | Keep | Improve |
| --- | --- | --- |
| Moxfield | Fast building, image and text views, tags, collection tools, and sharing | Better guided building and clearer recommendations |
| TipsyMagic | Live analytics, synergy and combo panels, import/export, and AI actions | Every suggestion should show evidence, reasoning, and confidence |
| Limitless One Piece | Tournament results, Leader rankings, and recent meta lists | Turn raw results into deck cores, flex slots, matchup advice, and recommended changes |
| Official Azuki app | Legality checking and Leader/Gate selection | Add public decks, deeper analysis, community features, and unlimited experimentation |

Moxfield currently emphasizes flexible deck views, custom tagging, collection tracking, and broad format support. TipsyMagic adds AI analysis, synergy and combo tools, price history, deck statistics, and actions such as “Fix mana base” and “Improve card draw.”

Sources:

- [Moxfield feature overview](https://www.patreon.com/moxfield)
- [TipsyMagic deck builder](https://tipsymagic.com/ViewDeck.html)
- [TipsyMagic homepage and tools](https://tipsymagic.com/)

The official Azuki app now includes its own legal 50-card deck builder and allows users to keep up to 20 decks. Therefore, simply offering an Azuki deck builder will not be enough. The opportunity is better analysis, discovery, sharing, versioning, and community tools.

- [Azuki TCG app deck-builder update](https://tcg.azuki.com/blog/019fda93-a364-799e-be38-1ea5510b2e7a)

## Flagship Feature: Build Around This Card

After choosing a Commander, Leader, or Azuki Leader/Gate pair, the user follows a guided process.

### 1. Choose a Build Path

- Top competitive build
- Guided custom brew
- Budget version
- Build from my collection
- Blank deck

### 2. Choose Preferences

- Casual, optimized, or tournament-focused
- Preferred archetype or playstyle
- Maximum budget
- Favorite cards that must be included
- Strategies or cards to avoid
- Preferred complexity level
- Region, format, set, or legality date

### 3. Generate a Starting Blueprint

The site produces a structured deck shell containing:

- Consensus core
- Engine and synergy packages
- Interaction package
- Flex and tech slots
- Resource or mana package
- Suggested finishers
- Optional combo packages

### 4. Refine With the Live Deck Coach

Every recommendation should explain:

- Why the card fits
- Which cards it works with
- What role it fills
- How often it appears in relevant decks
- Whether the recommendation comes from tournament, community, or curated data
- What card it could replace
- Price and cheaper substitutes
- Confidence level and sample size

This transparency should be one of the platform’s largest advantages over a generic AI chat box.

## Smart Recommendation System

The recommendation system should be evidence-backed rather than relying entirely on generative AI.

### Candidate Selection

First filter the card pool using deterministic rules:

- Game and format legality
- Commander color identity or Leader color/element
- Banned, restricted, and paired-card rules
- Card-role requirements
- User budget
- Cards already owned
- Selected strategy or archetype

### Candidate Ranking

Rank legal cards using a mixture of:

- Synergy with the Commander or Leader
- Synergy with cards already in the deck
- Appearance in successful decklists
- Recent tournament usage
- Curve fit
- Searcher or engine compatibility
- Combo participation
- Budget fit
- Collection ownership
- Community feedback

### AI’s Role

Use AI primarily to:

- Explain recommendations in plain language
- Summarize the deck’s game plan
- Generate primers and matchup notes from verified deck data
- Translate a user’s natural-language request into structured search filters

Legality, combo detection, probability, and deck statistics should be determined by rules and stored data—not guessed by an AI model.

## Standout Feature Ideas

### Deck DNA

A visual summary of what the deck is trying to accomplish:

- Primary and secondary game plans
- Speed or expected winning turn
- Aggression, control, consistency, and resilience ratings
- Key engines
- Finishers
- Major weaknesses
- Dependency on the Commander or Leader
- Vulnerability to disruption

### Consensus Core and Flex Slots

Analyze successful lists for the selected Commander or Leader and divide cards into:

- Core cards
- Common packages
- Meta choices
- Flex slots
- Experimental cards
- Cards falling out of favor

Users should be able to filter the analysis by:

- Recent or all-time data
- Region
- Format or set
- Budget
- Casual, competitive, or tournament-only decks
- Minimum event size
- Verified lists only

### Combo Radar

Instead of only listing complete combos, show:

- Combos already included in the deck
- Combos that are one card away
- Combos that are two cards away
- Replacement pieces
- Required setup
- The result of the combo
- Mana or resource requirements
- Weak points and ways opponents can interrupt it
- Whether the combo is legal for the selected format and date

For One Piece and Azuki, these interactions can be labeled **Power Lines** or **Sequences** when they are strong play patterns rather than infinite combos.

### Cut Coach

When a deck exceeds its legal card limit, rank possible cuts using:

- Low synergy
- Redundant effects
- Poor curve fit
- Weak performance in comparable decks
- Too many cards in one role
- Conflict with the chosen strategy
- High price compared with its expected contribution

The feature should always explain the tradeoff instead of simply saying “remove this card.”

### Swap Lab

Let users compare a current card with a suggested replacement side by side:

- Strategy fit
- Curve impact
- Deck-role impact
- Combo changes
- Price difference
- Owned versus missing
- Tournament usage
- Opening-hand probability changes

### Meta Lens

For each Commander or Leader, show:

- Most popular archetypes
- Recent successful decks
- Common opposing Leaders
- Favored and difficult matchups
- Frequently used tech cards
- Meta share over time
- Changes following new sets, errata, or bans
- Sample size and confidence

[Limitless One Piece](https://onepiece.limitlesstcg.com/) demonstrates how useful tournament and Leader-level data can be. The improvement would be turning that raw information into actionable deck changes.

### Budget Twin

Create a lower-cost version of an existing deck while preserving its strategy:

- Identify the most expensive cards
- Suggest functional alternatives
- Show what is lost or gained with each replacement
- Set a target total price
- Prefer cards already in the user’s collection

### Collection Mode

Allow users to build using:

- Only cards they own
- Owned cards plus a chosen purchase budget
- Preferred printings or alternate art
- Shared cards already assigned to other physical decks
- A missing-card shopping list

### Deck Passport

Generate a clean, shareable summary containing:

- Cover card
- Deck name
- Commander or Leader
- Archetype
- Power or competitiveness label
- Estimated price
- Key cards
- Deck QR code or short link

### What Changed?

After a set release, ban, or rules update, automatically explain:

- Which saved decks are now illegal
- Which cards gained or lost popularity
- New cards that fit existing decks
- Recommended replacements for banned cards
- Changes in the Leader’s meta position

## Deck Builder Experience

### Desktop Layout

A strong desktop builder could use three panels:

1. **Left:** Card search, filters, and recommendations
2. **Center:** Deck list or visual card stacks
3. **Right:** Deck Coach, analytics, warnings, and combo information

### Builder Features

- Image, compact list, text, and grouped-stack views
- Drag-and-drop cards
- Fast keyboard controls
- Card preview on hover
- Bulk selection and tagging
- Custom categories
- Quick quantity controls
- Select alternate printing without changing the logical card
- Automatic save
- Undo and redo
- Deck notes
- Sideboard or optional-card sections when supported
- Maybeboard and considering sections
- Import from pasted text
- Export to text and supported game clients
- Shareable public, private, and unlisted links
- Mobile-friendly bottom sheets instead of cramped desktop panels

## Card Search

Support both structured filters and natural-language searches.

Example searches:

- “Green One Piece blockers costing 3 or less with 2K counter”
- “Azuki Water entities with high Gate Power”
- “Black Commander creatures that return artifacts from the graveyard”

### Search Filters

- Game
- Format
- Card name
- Rules text
- Type or category
- Color or element
- Cost or mana value
- Power, attack, health, life, and counter value
- Set
- Rarity
- Trait, faction, or creature type
- Legality
- Price
- Owned or missing
- Artist
- Alternate art or finish

### Individual Card Pages

Each card page should contain:

- All printings and alternate art
- Current and historical legality
- Rulings and errata
- Decks using the card
- Best Commanders or Leaders for it
- Combos and synergies
- Recent usage trend
- Price history
- Cards with similar functions
- Add-to-deck and add-to-collection actions

The database should store the gameplay identity of a card separately from its printings. This prevents alternate art from being treated as a separate gameplay card.

## Deck Analytics

### Universal Analytics

- Card count and legality
- Cost curve
- Card-type distribution
- Draw probabilities
- Opening-hand odds
- Key-card odds by a selected turn
- Price and missing-card cost
- Card-role distribution
- Combo and synergy coverage
- Duplicate or redundancy analysis

### Magic: The Gathering Commander

- Commander color identity
- Singleton legality
- Partner, Background, and special deck-building rules
- Mana sources versus colored mana requirements
- Land count
- Ramp, card draw, removal, protection, board wipes, and finishers
- Average mana value
- Commander dependency
- Complete and near-complete combos
- Casual, optimized, and cEDH context kept separate

### One Piece Card Game

- Leader-color legality
- Exact deck size and copy limits
- Current ban, restriction, banned-pair, and block legality
- Character, Event, and Stage distribution
- Cost curve
- 1K and 2K counter totals
- No-counter card count
- Searcher hit rates
- Trigger density
- Blocker count
- Removal and top-end finishers
- Trait and crew-package coverage
- Expected plays by DON!! turn

One Piece legality must be stored as dated rules rather than a permanent yes/no flag. Bandai supports banned cards, restricted cards, and banned pairs, meaning two individually legal cards can still be illegal together.

- [Official One Piece banned and restricted card information](https://en.onepiece-cardgame.com/news/restriction.html)
- [Official One Piece rules](https://en.onepiece-cardgame.com/rules/)

### Azuki TCG

- Leader and Gate element matching
- Legal 50-card main deck
- Current bans and errata
- IKZ cost curve
- Entity, Spell, and Weapon ratios
- Gate Power distribution
- Portal targets
- Response-card density
- Alley setup tools
- Garden pressure
- Leader weapon access
- Early-, mid-, and late-game plans

Azuki deserves its own custom dashboard because its Gate, Alley/Garden, portal, weapon, response, and IKZ systems do not map cleanly onto Magic-style statistics.

- [Official Azuki TCG gameplay guide](https://tcg.azuki.com/how-to-play)
- [Official Azuki TCG card gallery](https://tcg.azuki.com/gallery)

## Commander and Leader Hub Pages

Each Commander or Leader should have a dedicated discovery page containing:

- Card image and rules text
- Current legality
- Popularity trend
- Archetype overview
- Common deck cores
- Popular synergy packages
- Complete and near-complete combos
- Recent tournament or verified community lists
- Budget examples
- Beginner-friendly starting list
- Common matchup strengths and weaknesses
- Most-added and most-cut cards
- Recent changes caused by new cards or bans

For Azuki, this should be a **Leader/Gate Pair Hub**, while still letting users compare every legal Gate for a selected Leader.

## Community and Deck Posting

### Published Deck Pages

Each published deck should support:

- Cover card and custom title
- Short strategy summary
- Full primer
- Mulligan guide
- Matchup notes
- Combo explanations
- Change log
- Custom categories and tags
- Comments attached to individual cards
- Likes, bookmarks, and forks
- Labels such as Theorycraft, Tested, Tournament, Budget, and Beginner

Verified tournament placements should look different from unverified claims.

### Profiles

- Display name and profile image
- Favorite games
- Featured decks
- Deck folders
- Followers and following
- Saved decks
- Public collection, if enabled
- Tournament results and verification badges
- Recent deck changes

### Deck Versions and Forks

Every saved milestone can become a named version:

- Compare two versions card by card
- Restore an older version
- Add a version note
- Fork another user’s deck with automatic credit
- View the original deck’s evolution
- Follow a deck for future updates
- Show upstream changes after forking

### Collaborative Brewing

- Invite another user as an editor
- Live presence indicators
- Comments and card suggestions
- Accept or reject proposed changes
- Group decks for private playgroups or teams

## Suggested Site Map

### Main Navigation

- Home
- Cards
- Commanders / Leaders
- Decks
- Builder
- Combos / Power Lines
- Meta
- Community
- Collection
- Profile

A persistent game switcher should change the site between Magic, One Piece, and Azuki while preserving a consistent master brand.

### Home Page

- Select a game
- Start with a Commander or Leader
- Trending decks
- Recent tournament decks
- New cards
- Popular community creators
- Recent bans and format updates

### User Dashboard

- Recent decks
- Pinned decks
- Drafts
- Followed deck updates
- Recommendations for saved decks
- New cards that fit existing decks
- Legality warnings
- Collection and price summary

## Recommended Roadmap

### Phase 1: First Release

- Magic Commander, One Piece constructed, and Azuki constructed
- Card database ingestion and updates
- Fast card search
- Visual and text deck views
- Import and export
- Automatic legality checking
- Core deck analytics
- Public, private, and unlisted decks
- Commander and Leader hub pages
- Top and recent decklists
- Basic evidence-backed recommendations
- User profiles
- Follows, likes, bookmarks, and comments

### Phase 2: Intelligence and Community

- Consensus Core
- Combo Radar
- Cut Coach
- Swap Lab
- Deck versioning and forks
- Budget and collection modes
- Advanced meta pages
- Matchup guides
- Collaborative brewing
- Verified tournament deck labels

### Phase 3: Advanced Tools

- Opening-hand and mulligan simulator
- Full goldfish playtester
- Match logging
- Probability calculator
- Mobile card scanner
- Local playgroup spaces
- Tournament submission and verification
- Native mobile app or progressive web app

## Features to Postpone

Avoid expanding the first release into several separate products. Postpone:

- Card marketplace
- Webcam play platform
- Full tournament organizer
- Proxy generator
- Custom card generator
- Support for every Magic format
- AI chat as the primary interface

These features could distract from the platform’s main advantage: the best Commander- and Leader-focused building experience.

Proxy tools deserve extra caution because of intellectual-property and counterfeit concerns, particularly for One Piece.

## Data and Technical Strategy

Use one shared platform with a separate rules-and-analysis adapter for each game.

### Important Core Entities

- Game
- Card identity
- Card printing
- Set
- Format
- Legality snapshot
- Commander or Leader
- Gate
- Deck
- Deck version
- Deck card
- Collection item
- Card role
- Archetype
- Combo or sequence
- Tournament
- Tournament result
- Price snapshot

### Why Legality Must Be Versioned

Legality can change because of:

- Bans and restrictions
- Banned card pairs
- Rotation or block systems
- Errata
- Regional card pools
- New format rules

A deck should therefore be evaluated against a selected game, region, format, and effective date.

### Magic Data

Scryfall provides documented APIs and daily bulk exports. Commander Spellbook provides an open-source Commander combo database.

- [Scryfall REST API](https://scryfall.com/docs/api)
- [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data)
- [Commander Spellbook](https://commanderspellbook.com/about/)

For high-volume card data, use Scryfall bulk exports rather than making large numbers of individual API calls.

### One Piece Data

- Use an authorized data provider or obtain permission
- Use official dated rules for legality
- Seek permission or licensing before reproducing protected card images and text
- Do not scrape Limitless or Bandai as a substitute for a data agreement

The official One Piece site explicitly states that its images, text, and data may not be reproduced without permission.

- [Official One Piece rules and legal notice](https://en.onepiece-cardgame.com/rules/)
- [Official One Piece card list](https://en.onepiece-cardgame.com/cardlist/)

### Azuki Data

- Request official data or API access
- Request image and card-text permission
- Use official rules, bans, and errata as the legality authority
- Do not automate access to or scrape the official companion app

The Azuki organized-play terms prohibit automated means such as bots, scripts, and scrapers from accessing or interacting with the app.

- [Azuki TCG terms and conditions](https://tcg.azuki.com/terms-and-conditions)

### Intellectual Property Approach

- Build an original interface and visual identity
- Borrow interaction patterns, not competitor designs or code
- Do not copy deck data from competitors without permission
- Include appropriate unofficial-project disclosures
- Follow each publisher’s fan-content and trademark policies
- Obtain legal review before monetizing protected card art or text

For Magic, review Wizards of the Coast’s fan-content policy in addition to Scryfall’s API and image requirements.

- [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
- [Scryfall Terms of Service](https://scryfall.com/docs/terms)

## Recommended Product Positioning

The platform should be positioned as:

> A multi-TCG deck lab where players can discover proven strategies, understand every recommendation, build their own version, and share how it evolves.

The core differentiators are:

1. Leader-first building across three games
2. Truly game-specific analytics
3. Explainable recommendations backed by deck and tournament data
4. Consensus cores, flex slots, and near-combo detection
5. Strong deck versioning, forking, and community publishing
6. Budget- and collection-aware recommendations
7. A clean experience that works equally well for beginners and advanced players

## Recommended Next Planning Step

Turn this feature plan into a complete product requirements document containing:

- Page-by-page requirements
- User stories
- Detailed builder wireframes
- Database schema
- Recommendation scoring logic
- Data ingestion plan
- API design
- MVP acceptance criteria
- Build order for a coding agent

