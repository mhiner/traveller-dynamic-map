# Traveller Dynamic Map

A Deno library that draws a Traveller star chart from sector data. Two directories beside the library are not part of the published package.

## dev

`dev` is a local preview of the chart, based upon a trade-app game I created then extracted the JSR from. `deno task dev` serves it in the browser, bundles the page, and proxies Traveller Map. The sector cache sits next to that server.

## foundry

`foundry` is the Foundry Virtual Tabletop module Traveller Astrogation. It shows the chart as its own scene, with sector data in a compendium and world actors in another. `deno task foundry` builds the module. `deno task foundry-release 0.1.1` sets that version in `module.json` and writes `foundry/traveller-astrogation-0.1.1.zip`. The Foundry directory is not part of the published library.

## Fair use

The Mongoose Publishing Traveller Fair Use Policy (2024) requires this notice for a non-commercial site or downloadable module:

> The Traveller game in all forms is owned by Mongoose Publishing. Copyright 1977 - 2024 Mongoose Publishing. Traveller is a registered trademark of Mongoose Publishing. Mongoose Publishing permits web sites and fanzines for this game, provided it contains this notice, that Mongoose Publishing is notified, and subject to a withdrawal of permission on 90 days notice. The contents of this site are for personal, non-commercial use only. Any use of Mongoose Publishing’s copyrighted material or trademarks anywhere on this web site and its files should not be viewed as a challenge to those copyrights or trademarks. In addition, any program/articles/file on this site cannot be republished or distributed without the consent of the author who contributed it.

The policy is published at [Traveller Licensing](https://www.mongoosepublishing.com/pages/traveller-licensing). 
