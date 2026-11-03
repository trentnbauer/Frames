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

-   [ ] Preserve original photographs without modifying them.
-   [ ] Organise photographs by photoshoot, subject and tag.
-   [ ] Provide optional AI-powered image analysis and discovery.
-   [ ] Help users evaluate photographs over multiple review sessions.
-   [ ] Learn photographic preferences through review history.
-   [ ] Recommend individual photographs and complementary images.
-   [ ] Create and manage curated photographic collections.
-   [ ] Export collections for use in external software and printing.
-   [ ] Share button on collections and photoshoots, generating a like with url/s/abc123 that allows a user to either download the files or review them

## 2. Product Requirements

### 2.1 Deployment and Storage

-   [ ] The application must be self-hostable and deployable using
    Docker.
-   [ ] Support both internally managed photo storage and externally
    referenced image libraries including cloud storage
-   [ ] Preserve original photographs without modification.
-   [ ] Keep generated thumbnails, previews and other derivatives
    separate from originals.
-   [ ] Support persistent application data and configuration.
-   [ ] External libraries must be read-only by default.
-   [ ] Support rescanning external libraries to identify new, changed
    or removed photographs.

The developer is free to choose the implementation technologies and
architecture.

### 2.2 Image Support and Processing

-   [ ] Support common photographic formats, including RAW, TIFF, JPEG
    and PNG.
-   [ ] Support bulk image ingestion.
-   [ ] Extract EXIF/IPTC metadata, including camera, lens, capture
    date, dimensions and GPS information where available.
-   [ ] Extract embedded JPEG previews from RAW files wherever
    available.
-   [ ] Generate previews when embedded previews are unavailable.
-   [ ] Generate and cache thumbnails.
-   [ ] Identify exact duplicates and potential near-duplicates.
-   [ ] Support edited variations and alternative crops associated with
    their original photographs.

Original photographs must remain untouched.

### 2.3 AI Processing

AI functionality must be optional.

When enabled, AI should support:

-   [ ] Subject, object, animal and environment recognition.
-   [ ] Automatic descriptions, tags and keywords.
-   [ ] Colour palette identification.
-   [ ] Composition, lighting and visual characteristic analysis.
-   [ ] Image similarity and semantic search.
-   [ ] Recommendations based on image content.

Additional requirements:

-   [ ] Users can review, edit and reject AI-generated information.
-   [ ] Support local and external AI providers.
-   [ ] The application remains fully usable for core library
    management, reviews and manual collections when AI is disabled.
-   [ ] Make external AI processing and its privacy implications clear
    to users.

### 2.4 Photo Organisation

**Photoshoots**

-   [ ] Create and manage photoshoots.
-   [ ] Associate photographs with photoshoots.
-   [ ] Record dates, locations and descriptions.
-   [ ] Suggest groupings based on folders, capture dates and metadata.

**Subjects and Tags**

-   [ ] Create and manage subjects and tags.
-   [ ] Associate multiple subjects and tags with photographs.
-   [ ] Browse and filter photographs using these attributes.

Photographs must remain independently accessible regardless of their
organisational associations.

### 2.5 Search and Discovery

-   [ ] Search filenames and metadata.
-   [ ] Filter by photoshoot, subject and tag.
-   [ ] Filter by capture date and location.
-   [ ] Find visually similar photographs.
-   [ ] Search using colours and composition.
-   [ ] Support natural-language searches when AI is enabled.
-   [ ] Combine multiple search criteria.

Basic searching and filtering must work without AI.

### 2.6 Review and Evaluation

Allow photographs to be evaluated over multiple sessions.

-   [ ] Provide six review sessions by default.
-   [ ] Allow the number of sessions and review intervals to be
    configured.
-   [ ] Support ratings from one to five stars.
-   [ ] Allow optional review notes.
-   [ ] Maintain complete review history.
-   [ ] Display average ratings and rating trends.
-   [ ] Randomise review ordering.
-   [ ] Hide previous ratings during subsequent reviews.
-   [ ] Track review completion.
-   [ ] Allow photographs to be reviewed again.

Review frequency should adapt to rating consistency:

-   [ ] Consistently rated photographs receive less frequent reviews.
-   [ ] Inconsistently rated photographs receive more frequent reviews.
-   [ ] Allow users to exclude or archive consistently low-rated
    photographs.

Review status must never prevent a photograph from appearing in normal
browsing, searching or collections.

### 2.7 Recommendations

Provide recommendations using photographic metadata, optional AI
analysis and review history.

-   [ ] Recommend consistently highly rated photographs.
-   [ ] Identify photographs with improving ratings.
-   [ ] Identify overlooked or forgotten photographs.
-   [ ] Recommend visually similar photographs.
-   [ ] Recommend complementary photographs.
-   [ ] Find photographs sharing subjects, colours or composition.
-   [ ] Identify photographs from different photoshoots that work well
    together.
-   [ ] Suggest potential photographic collections.
-   [ ] Learn from accepted and rejected recommendations.

### 2.8 Collections

Collections allow users to assemble and curate groups of photographs for
particular purposes.

-   [ ] Create, edit and delete manual collections.
-   [ ] Generate optional AI-assisted collection suggestions.
-   [ ] Add and remove photographs.
-   [ ] Reorder photographs.
-   [ ] Add collection names, descriptions and themes.
-   [ ] Suggest complementary photographs.
-   [ ] Identify repetitive or visually similar photographs.
-   [ ] Suggest alternative photographs.
-   [ ] Compare photographs within a collection.

#### Collection Picture Specifications

Users should be able to optionally define image requirements for
individual collections. These specifications help determine whether
photographs are suitable for their intended purpose, particularly
printing.

-   [ ] Set a minimum pixel resolution.
-   [ ] Specify an intended print size and required DPI/PPI.
-   [ ] Set an orientation requirement: portrait, landscape or either.
-   [ ] Set an optional preferred or required aspect ratio.
-   [ ] Identify photographs that meet or fail the collection's
    specifications.
-   [ ] Clearly communicate why a photograph does not meet a
    requirement.
-   [ ] Allow specifications to be changed or removed without affecting
    the photographs themselves.

Specifications are optional. Collections without defined requirements
should operate normally.

Print suitability should be evaluated using both pixel dimensions and
intended physical print size. DPI/PPI alone is not sufficient.

#### Collection Export

Every collection must provide a prominent **Download files** button.

Selecting this button should download the original photographs in that
collection as individual files (no ZIP archive).

-   [ ] Provide a clearly visible Download files button on each
    collection.
-   [ ] Include all photographs in the collection.
-   [ ] Preserve original image files and their quality.
-   [ ] Support collections containing RAW, TIFF, JPEG and PNG files.
-   [ ] Use meaningful filenames.
-   [ ] Preserve collection ordering information where practical.
-   [ ] Show export progress and completion.
-   [ ] Notify users if any photographs cannot be included.
-   [ ] Do not modify or convert original photographs during export.

The purpose is to provide a straightforward way to download a complete
collection for printing or further work in external creative software.

The application does not perform print layout, image editing or
production management.

## 3. Metadata and Portability

-   [ ] Read existing XMP sidecar files.
-   [ ] Export approved metadata to XMP sidecars.
-   [ ] Maintain application metadata independently of original image
    files.
-   [ ] Support portable metadata between photographic applications.
-   [ ] Make external metadata write-back configurable.
-   [ ] Provide sensible handling for conflicting metadata.

External libraries remain read-only by default.

## 4. Statistics and Insights

Provide a simple overview of the photographic archive.

-   [ ] Show total photographs and storage consumption.
-   [ ] Show photographs per photoshoot.
-   [ ] Show subject and tag distribution.
-   [ ] Show review completion.
-   [ ] Show rating distribution and trends.
-   [ ] Show highest-rated photographs.
-   [ ] Show the number of photographs in collections.

Complex analytics dashboards are not required.

## 5. Development Priorities

The following is a suggested development sequence.

### Phase 1 --- Foundation

-   [ ] Docker-based deployment.
-   [ ] Internal and external storage support.
-   [ ] Image ingestion.
-   [ ] Metadata extraction.
-   [ ] Thumbnail and preview generation.
-   [ ] Embedded RAW preview extraction.

### Phase 2 --- Organisation

-   [ ] Photoshoot management.
-   [ ] Subject and tag management.
-   [ ] Image variants.
-   [ ] Duplicate detection.
-   [ ] Basic browsing and filtering.
-   [ ] External library rescanning.

### Phase 3 --- AI and Discovery

-   [ ] AI provider integration.
-   [ ] Automatic tagging and descriptions.
-   [ ] Image similarity analysis.
-   [ ] Visual similarity search.
-   [ ] Semantic search.
-   [ ] Colour and composition analysis.

### Phase 4 --- Reviews

-   [ ] Multi-session reviews.
-   [ ] Rating history.
-   [ ] Review scheduling.
-   [ ] Adaptive review frequency.
-   [ ] Review statistics.

### Phase 5 --- Recommendations

-   [ ] Personalised recommendations.
-   [ ] Complementary image discovery.
-   [ ] Collection suggestions.

### Phase 6 --- Collections and Export

-   [ ] Manual collections.
-   [ ] AI-assisted collection suggestions.
-   [ ] Collection comparison.
-   [ ] Collection picture specifications.
-   [ ] Print suitability indicators.
-   [ ] Download of original photographs as individual files.

### Phase 7 --- Refinement

-   [ ] XMP portability.
-   [ ] Processing reliability.
-   [ ] Performance optimisation.
-   [ ] Basic statistics.
-   [ ] Backup and recovery improvements.

## 6. Out of Scope

The initial application is not intended to provide:

-   [ ] Full photo editing or RAW development.
-   [ ] Photobook design or print layout.
-   [ ] Gallery wall or framing previews.
-   [ ] Exhibition management.
-   [ ] Social networking or public galleries.
-   [ ] Multi-user collaboration.
-   [ ] Advanced photography journaling.
-   [ ] Gamification or photography challenges.
-   [ ] Complex analytics and reporting.
-   [ ] Automated publishing integrations.
-   [ ] Full external file synchronisation or management.
-   [ ] Custom AI model training.
-   [ ] Advanced ranking algorithms.

## 7. Product Success Criteria

The application should allow a user to:

-   [ ] Import or reference a large photographic archive without
    modifying original photographs.
-   [ ] Organise photographs by photoshoot, subject and tag.
-   [ ] Browse and discover photographs with or without AI.
-   [ ] Review photographs over multiple sessions and build a meaningful
    rating history.
-   [ ] Receive useful recommendations based on photographic
    preferences.
-   [ ] Assemble cohesive photographic collections.
-   [ ] Define picture specifications for individual collections.
-   [ ] Identify photographs that are unsuitable for a collection's
    intended print requirements.
-   [ ] Download an entire collection as its original photograph
    files.
-   [ ] Deploy and maintain the application through Docker.

------------------------------------------------------------------------

**Core product principle:** Preserve the photographs, understand their
content, learn the photographer's preferences and make it easier to
discover, curate and export meaningful photographic work.
