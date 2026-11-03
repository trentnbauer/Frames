# Photographic Archive & Curation Platform

**Product Requirements & Design Document**\
Version 1.2

## Notes for UI design

This document describes what the application does, not how it looks.
Screen list, navigation and layout are deliberately left to the
designer.

-   The checkboxes in this document are both requirements and a to-do
    list. An unticked box is still to be built.
-   There is a single user: one photographer. There is no sharing,
    login-based collaboration or multi-user UI.
-   Reviewing photographs is the core daily habit of the product. Review
    sessions should be a primary, easily reached activity, not a
    secondary feature.
-   This is a curated portfolio archive, not a dump of every photograph
    taken. Roughly one in ten photographs is expected to be kept, so
    expect a modest library (thousands of photographs, not hundreds of
    thousands). Browsing should favour looking at photographs well over
    handling huge volumes.
-   The photographs are the focus. The interface should stay out of
    their way.
-   Design the whole product, but the build order in section 5 applies:
    foundation and organisation come first, AI features last.
-   The application must look and work correctly with AI disabled.

## 1. Product Overview

A self-hosted web application for storing, organising, reviewing and
curating photographic work.

The application helps photographers discover their strongest
photographs, identify overlooked images, understand their photographic
preferences and assemble cohesive collections for external creative and
print-production software.

It combines traditional photo-library management with optional
AI-assisted analysis, photographic reviews and personalised
recommendations.

The application is not intended to replace professional photo-editing or
publishing software.

### Primary objectives

-   [x] Preserve original photographs without modifying them.
-   [x] Organise photographs by photoshoot, subject and tag.
-   [x] Provide optional AI-powered image analysis and discovery.
-   [x] Help users evaluate photographs over multiple review sessions.
-   [x] Learn photographic preferences through review history.
-   [x] Recommend individual photographs and complementary images.
-   [x] Create and manage curated photographic collections.
-   [x] Export collections for use in external software and printing.
-   [x] Share button on collections and photoshoots, generating a like with url/s/abc123 that allows a user to either download the files or review them
-   [x] Optionally restrict access with sign-in through OAuth providers.

## 2. Product Requirements

### 2.1 Deployment and Storage

-   [x] The application must be self-hostable and deployable using
    Docker.
-   [ ] Support both internally managed photo storage and externally
    referenced image libraries including cloud storage
    -   *Done: uploaded photos (internal) and read-only library folders
        (external), including a cloud drive mounted as a folder.*
    -   *Done: built-in sync from Google Drive, Dropbox and OneDrive
        (Settings, Cloud sync): one way, read-only on the provider's
        side, files already copied are never overwritten or deleted.*
    -   *Not done: S3 and WebDAV connectors.*
-   [x] Preserve original photographs without modification.
-   [x] Keep generated thumbnails, previews and other derivatives
    separate from originals.
-   [x] Support persistent application data and configuration.
-   [x] External libraries must be read-only by default.
-   [x] Support rescanning external libraries to identify new, changed
    or removed photographs.

The developer is free to choose the implementation technologies and
architecture.

### 2.2 Image Support and Processing

-   [x] Support common photographic formats, including RAW, TIFF, JPEG
    and PNG.
-   [x] Support bulk image ingestion.
-   [x] Extract EXIF/IPTC metadata, including camera, lens, capture
    date, dimensions and GPS information where available.
-   [x] Extract embedded JPEG previews from RAW files wherever
    available.
-   [x] Generate previews when embedded previews are unavailable.
    -   *JPEG, PNG and TIFF are resized directly. A RAW file whose
        embedded preview is missing or small is developed to a JPEG
        (fast, half size) only to make its thumbnail and preview. This
        is not RAW editing, which stays out of scope.*
-   [x] Generate and cache thumbnails.
-   [x] Identify exact duplicates and potential near-duplicates.
-   [x] Support edited variations and alternative crops associated with
    their original photographs.

Original photographs must remain untouched.

### 2.3 AI Processing

AI functionality must be optional.

When enabled, AI should support:

-   [x] Subject, object, animal and environment recognition.
-   [x] Automatic descriptions, tags and keywords.
-   [x] Colour palette identification.
-   [x] Composition, lighting and visual characteristic analysis.
-   [x] Image similarity and semantic search.
-   [x] Recommendations based on image content.

Additional requirements:

-   [x] Users can review, edit and reject AI-generated information.
-   [x] Support local and external AI providers.
-   [x] The application remains fully usable for core library
    management, reviews and manual collections when AI is disabled.
-   [x] Make external AI processing and its privacy implications clear
    to users.

### 2.4 Photo Organisation

**Photoshoots**

-   [x] Create and manage photoshoots.
-   [x] Associate photographs with photoshoots.
-   [x] Record dates, locations and descriptions.
-   [x] Suggest groupings based on folders, capture dates and metadata.

**Subjects and Tags**

-   [x] Create and manage subjects and tags.
-   [x] Associate multiple subjects and tags with photographs.
-   [x] Browse and filter photographs using these attributes.

Photographs must remain independently accessible regardless of their
organisational associations.

### 2.5 Search and Discovery

-   [x] Search filenames and metadata.
-   [x] Filter by photoshoot, subject and tag.
-   [x] Filter by capture date and location.
-   [x] Find visually similar photographs.
-   [x] Search using colours and composition.
-   [x] Support natural-language searches when AI is enabled.
-   [x] Combine multiple search criteria.

Basic searching and filtering must work without AI.

### 2.6 Review and Evaluation

Allow photographs to be evaluated over multiple sessions.

-   [x] Provide six review sessions by default.
-   [x] Allow the number of sessions and review intervals to be
    configured.
-   [x] Support ratings from one to five stars.
-   [x] Allow optional review notes.
-   [x] Maintain complete review history.
-   [x] Display average ratings and rating trends.
-   [x] Randomise review ordering.
-   [x] Hide previous ratings during subsequent reviews.
-   [x] Track review completion.
-   [x] Allow photographs to be reviewed again.

Review frequency should adapt to rating consistency:

-   [x] Consistently rated photographs receive less frequent reviews.
-   [x] Inconsistently rated photographs receive more frequent reviews.
-   [x] Allow users to exclude or archive consistently low-rated
    photographs.

Review status must never prevent a photograph from appearing in normal
browsing, searching or collections.

### 2.7 Recommendations

Provide recommendations using photographic metadata, optional AI
analysis and review history.

-   [x] Recommend consistently highly rated photographs.
-   [x] Identify photographs with improving ratings.
-   [x] Identify overlooked or forgotten photographs.
-   [x] Recommend visually similar photographs.
-   [x] Recommend complementary photographs.
-   [x] Find photographs sharing subjects, colours or composition.
-   [x] Identify photographs from different photoshoots that work well
    together.
-   [x] Suggest potential photographic collections.
-   [x] Learn from accepted and rejected recommendations.

### 2.8 Collections

Collections allow users to assemble and curate groups of photographs for
particular purposes.

-   [x] Create, edit and delete manual collections.
-   [x] Generate optional AI-assisted collection suggestions.
-   [x] Add and remove photographs.
-   [x] Reorder photographs.
-   [x] Add collection names, descriptions and themes.
-   [x] Suggest complementary photographs.
-   [x] Identify repetitive or visually similar photographs.
-   [x] Suggest alternative photographs.
-   [x] Compare photographs within a collection.

#### Collection Picture Specifications

Users should be able to optionally define image requirements for
individual collections. These specifications help determine whether
photographs are suitable for their intended purpose, particularly
printing.

-   [x] Set a minimum pixel resolution.
-   [x] Specify an intended print size and required DPI/PPI.
-   [x] Set an orientation requirement: portrait, landscape or either.
-   [x] Set an optional preferred or required aspect ratio.
-   [x] Identify photographs that meet or fail the collection's
    specifications.
-   [x] Clearly communicate why a photograph does not meet a
    requirement.
-   [x] Allow specifications to be changed or removed without affecting
    the photographs themselves.

Specifications are optional. Collections without defined requirements
should operate normally.

Print suitability should be evaluated using both pixel dimensions and
intended physical print size. DPI/PPI alone is not sufficient.

#### Collection Export

Every collection must provide a prominent **Download files** button.

Selecting this button should download the original photographs in that
collection as individual files (no ZIP archive).

-   [x] Provide a clearly visible Download files button on each
    collection.
-   [x] Include all photographs in the collection.
-   [x] Preserve original image files and their quality.
-   [x] Support collections containing RAW, TIFF, JPEG and PNG files.
-   [x] Use meaningful filenames.
-   [x] Preserve collection ordering information where practical.
-   [x] Show export progress and completion.
-   [x] Notify users if any photographs cannot be included.
-   [x] Do not modify or convert original photographs during export.

The purpose is to provide a straightforward way to download a complete
collection for printing or further work in external creative software.

The application does not perform print layout, image editing or
production management.

### 2.9 Authentication and Access

Authentication must be optional. With nothing configured, the
application behaves as it does today. Where it is turned on, people sign
in through an OAuth provider instead of a shared password.

-   [x] Authentication is optional and off by default. The application
    works fully with no sign-in.
-   [x] Sign in with an OAuth 2.0 / OpenID Connect provider. Support
    well-known providers (for example Google, GitHub and Microsoft) and
    any standards-based OIDC provider (for example Authentik, Keycloak
    or Authelia) that a self-hoster already runs.
-   [x] Allow one or more providers to be configured (client ID, client
    secret, and for generic OIDC the issuer address). Secrets are
    stored safely and never sent back to the browser or included in
    backups.
-   [x] Restrict who may sign in with an allow-list (email addresses,
    email domains or provider account IDs). Anyone else is refused with
    a clear message and gets no access.
-   [x] Everyone who is allowed in has the same access. This is access
    control for the owner and trusted people, not per-person
    permissions or collaboration.
-   [x] Sessions use secure cookies with an expiry and a sign-out. The
    protections against cross-site requests continue to apply.
-   [x] Work behind a reverse proxy and over HTTPS, with a callback
    address that can be set, and show the exact address to register with
    the provider.
-   [x] Never lock the owner out: a configuration mistake or an
    unavailable provider has a documented way back in (for example an
    environment setting that switches sign-in off).
-   [x] Keep the existing shared-password option for simple setups, as a
    choice alongside OAuth.
-   [x] Share links keep working without signing in, and never grant
    access to anything beyond what the link shares.
-   [x] The health check stays reachable without signing in.

OAuth is used to decide who may sign in. Multi-user collaboration stays
out of scope (section 6).

### 2.10 Public Portfolio

The photographer can publish a public portfolio website made from one
collection, served by the application itself.

-   [x] Publish the photographs of a chosen collection as a public
    portfolio website, in a gallery with a hero (name, tagline, social
    links), a light/dark theme and a full-size viewer.
-   [x] Settings for the name, tagline, accent colour, social links,
    footer and a "My Gear" page written in simple Markdown.
-   [x] Add and remove photographs from the portfolio from the
    photograph's own page.
-   [x] Choose what a visitor gets at full size: a resized copy with all
    camera data removed (the default), the original file (with a clear
    warning that it can contain camera data and location), or nothing
    extra.
-   [x] Give the portfolio its own hostname. That hostname shows only the
    portfolio and nothing else of the application, so it is safe to make
    public through a tunnel or reverse proxy.
-   [x] Visitors can only reach photographs that are in the portfolio, and
    see nothing else about them (no places, notes or file paths).
-   [x] The portfolio stays public when sign-in is required for the rest
    of the application.

## 3. Metadata and Portability

-   [x] Read existing XMP sidecar files.
-   [x] Export approved metadata to XMP sidecars.
-   [x] Maintain application metadata independently of original image
    files.
-   [x] Support portable metadata between photographic applications.
-   [x] Make external metadata write-back configurable.
-   [x] Provide sensible handling for conflicting metadata.

External libraries remain read-only by default.

## 4. Statistics and Insights

Provide a simple overview of the photographic archive.

-   [x] Show total photographs and storage consumption.
-   [x] Show photographs per photoshoot.
-   [x] Show subject and tag distribution.
-   [x] Show review completion.
-   [x] Show rating distribution and trends.
-   [x] Show highest-rated photographs.
-   [x] Show the number of photographs in collections.

Complex analytics dashboards are not required.

## 5. Development Priorities

The following is a suggested development sequence.

### Phase 1 --- Foundation

-   [x] Docker-based deployment.
-   [x] Internal and external storage support.
-   [x] Image ingestion.
-   [x] Metadata extraction.
-   [x] Thumbnail and preview generation.
-   [x] Embedded RAW preview extraction.

### Phase 2 --- Organisation

-   [x] Photoshoot management.
-   [x] Subject and tag management.
-   [x] Image variants.
-   [x] Duplicate detection.
-   [x] Basic browsing and filtering.
-   [x] External library rescanning.

### Phase 3 --- AI and Discovery

-   [x] AI provider integration.
-   [x] Automatic tagging and descriptions.
-   [x] Image similarity analysis.
-   [x] Visual similarity search.
-   [x] Semantic search.
-   [x] Colour and composition analysis.

### Phase 4 --- Reviews

-   [x] Multi-session reviews.
-   [x] Rating history.
-   [x] Review scheduling.
-   [x] Adaptive review frequency.
-   [x] Review statistics.

### Phase 5 --- Recommendations

-   [x] Personalised recommendations.
-   [x] Complementary image discovery.
-   [x] Collection suggestions.

### Phase 6 --- Collections and Export

-   [x] Manual collections.
-   [x] AI-assisted collection suggestions.
-   [x] Collection comparison.
-   [x] Collection picture specifications.
-   [x] Print suitability indicators.
-   [x] Download of original photographs as individual files.

### Phase 7 --- Refinement

-   [x] XMP portability.
-   [x] Processing reliability.
-   [x] Performance optimisation.
-   [x] Basic statistics.
-   [x] Backup and recovery improvements.
-   [x] Optional OAuth sign-in (section 2.9).

## 6. Out of Scope

The initial application is not intended to provide:

-   [ ] Full photo editing or RAW development.
-   [ ] Photobook design or print layout.
-   [ ] Gallery wall or framing previews.
-   [ ] Exhibition management.
-   [ ] Social networking or public galleries.
-   [ ] Multi-user collaboration. (Optional sign-in, section 2.9, only
    controls who may get in. Everyone allowed in has the same access.)
-   [ ] Advanced photography journaling.
-   [ ] Gamification or photography challenges.
-   [ ] Complex analytics and reporting.
-   [ ] Automated publishing integrations.
-   [ ] Full external file synchronisation or management.
-   [ ] Custom AI model training.
-   [ ] Advanced ranking algorithms.

## 7. Product Success Criteria

The application should allow a user to:

-   [x] Import or reference a large photographic archive without
    modifying original photographs.
-   [x] Organise photographs by photoshoot, subject and tag.
-   [x] Browse and discover photographs with or without AI.
-   [x] Review photographs over multiple sessions and build a meaningful
    rating history.
-   [x] Receive useful recommendations based on photographic
    preferences.
-   [x] Assemble cohesive photographic collections.
-   [x] Define picture specifications for individual collections.
-   [x] Identify photographs that are unsuitable for a collection's
    intended print requirements.
-   [x] Download an entire collection as its original photograph
    files.
-   [x] Deploy and maintain the application through Docker.
-   [x] Optionally require sign-in through an OAuth provider, with
    share links still working for the people they are sent to.

------------------------------------------------------------------------

**Core product principle:** Preserve the photographs, understand their
content, learn the photographer's preferences and make it easier to
discover, curate and export meaningful photographic work.
