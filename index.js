
/**
 * @typedef { import('astro').AstroIntegration } AstroIntegration
 * @typedef { import('astro').ViteUserConfig } ViteUserConfig
 * 
 * @typedef { Pattern[] } Patterns
 * 
 * @typedef { { prerender: boolean } & Selector } Pattern
 * @typedef { | { startsWith : string }
 *            | { endsWith   : string }
 *            | { includes   : string }
 *            | { matches    : RegExp | string }
 * } Selector
 * 
 * @typedef {{
 *      startsWith ?: string
 *      endsWith   ?: string
 *      includes   ?: string
 *      matches    ?: RegExp | string
 * }} _Selector
 */

/**
 * @param { Patterns } patterns
 * @returns { AstroIntegration }
 */
export default function prerenderPatterns(patterns) {
    return {
        name: 'Prerender Patterns Integration',
        hooks: {
            ['astro:config:setup']({ config }) {
                // to remove path to pages directory from moduleIds
                const absolutePathPrefix = new URL('./pages', config.srcDir).pathname
                config.vite.plugins = [ ...config.vite.plugins ?? [], vitePlugin({ absolutePathPrefix, patterns }) ] 
            }
        }
    }
}

/**
 * @param {{ absolutePathPrefix: string, patterns : Patterns }}
 * @returns { ViteUserConfig['plugins'][number] }
 */
function vitePlugin({ absolutePathPrefix, patterns }) {
    return {
        name: 'Prerender Patterns Vite Plugin',
        generateBundle() {
            const moduleIds = Array.from(this.getModuleIds())
            moduleIds.forEach(moduleId => {
                const moduleInfo = this.getModuleInfo(moduleId)
                if (moduleInfo?.meta?.astro?.pageOptions === undefined) return
                
                const matchAgainst =
                    moduleId.startsWith(absolutePathPrefix)
                    ? moduleId.slice(absolutePathPrefix.length + 1)
                    : moduleId
                
                const override = overridePrerender(matchAgainst, patterns)
                if (override === undefined) return
                console.log('overriding prerender preference for ' + matchAgainst + ' - it will ' + (override ? '' : 'not ') + 'be prerendered' )
                moduleInfo.meta.astro.pageOptions.prerender = override
            })
        }
    }
}

/**
 * @param { string } modulePath
 * @param { Patterns } patterns
 * @returns { boolean | undefined }
 */
function overridePrerender(modulePath, patterns) {
    const [ override ] = patterns
        // if multiple rules match, the most specific one wins
        .sort((a, b) => {
            // exact matches should be pushed up
            const scoreA = Object.keys(a).length + (typeof a.matches === 'string' ? 4 : 0)
            const scoreB = Object.keys(b).length + (typeof b.matches === 'string' ? 4 : 0)
            if (scoreA !== scoreB) return scoreB - scoreA
            const lengthA = Object.values(a).reduce((acc, cur) => acc + (typeof cur === 'boolean' ? '' : cur)).length
            const lengthB = Object.values(b).reduce((acc, cur) => acc + (typeof cur === 'boolean' ? '' : cur)).length
            return lengthB - lengthA
        })
        .flatMap(pattern => moduleMatchesSelectors(modulePath, pattern) ? [ pattern.prerender ] : [])
    
    return override
}

/**
 * @param { string } modulePath
 * @param { _Selector }
 * @returns { boolean }
 */
function moduleMatchesSelectors(modulePath, { startsWith: _starts, endsWith, includes, matches: _matches }) {
    // ignore patterns that dont have conditions
    if (
        _starts  === undefined &&
        endsWith === undefined &&
        includes === undefined &&
        _matches === undefined
    ) return false;
    
    const startsWith =
        _starts?.startsWith('/')
            ? _starts.slice(1)
            : _starts
    
    const matches =
        typeof _matches === 'string' &&
        _matches?.startsWith('/')
            ? _matches.slice(1)
            : _matches
    
    const s = typeof startsWith == 'string' ? modulePath.startsWith(startsWith) : true
    const e = typeof endsWith   == 'string' ? modulePath.endsWith(endsWith)     : true
    const i = typeof includes   == 'string' ? modulePath.includes(includes)     : true
    const m = typeof matches    == 'string' ? modulePath === matches
            : matches instanceof RegExp     ? matches.test(modulePath)          : true
    
    return s && e && i && m
}
