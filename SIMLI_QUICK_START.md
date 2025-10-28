# Quick Start: Testing Simli SDK Improvements

## TL;DR

**Don't modify node_modules!** Use this approach instead:

1. ✅ **Use the wrapper NOW** (already created in `src/lib/simli-wrapper`)
2. ✅ **Fork Simli SDK** to your GitHub
3. ✅ **Link locally** with `npm link` for testing
4. ✅ **Submit PRs** to original repo when ready

## Today (Immediate Fix)

Replace your current Simli usage:

```typescript
// ❌ OLD - Don't do this anymore
import { SimliClient } from 'simli-client';
const client = new SimliClient();
client.Initialize(config);

// ✅ NEW - Use wrapper instead
import { SimliClientWrapper } from '@/lib/simli-wrapper';
const client = new SimliClientWrapper(config);
// Same API, but safer!
```

**Benefits:**
- Fixes memory leaks
- Better reconnection
- Proper cleanup
- Works with existing code

## This Week (Fork & Setup)

```bash
# 1. Fork simli-ai/simli-client on GitHub

# 2. Clone YOUR fork (not in mvp-frontend!)
cd ~/PROJECTS
git clone https://github.com/YOUR-USERNAME/simli-client.git
cd simli-client

# 3. Install & link
npm install
npm link

# 4. Link to your app
cd ~/PROJECTS/AILUNA/mvp-frontend
npm link simli-client

# Now changes in ~/PROJECTS/simli-client reflect in your app!
```

## Next 10 Weeks (Refactor)

Work in `~/PROJECTS/simli-client/` following the implementation guide.

Build one component per week:
- Week 1-2: Utils (Logger, EventEmitter, etc.)
- Week 3-4: Transport layer
- Week 5-6: Session & Media
- Week 7-8: Connection Manager
- Week 9-10: Polish & PRs

## Testing Changes

```bash
# In simli-client repo
npm run build

# Changes automatically available in your app
cd ~/PROJECTS/AILUNA/mvp-frontend
npm run dev

# Test the changes!
```

## Submitting to Simli

### Option 1: Incremental PRs (Best)

Submit small PRs to original repo:
- PR #1: Add utilities
- PR #2: Extract WebSocket
- PR #3: Extract WebRTC
- etc.

### Option 2: Publish Your Fork

If they don't accept PRs:

```bash
# Use your fork in package.json
{
  "dependencies": {
    "simli-client": "github:YOUR-USERNAME/simli-client#main"
  }
}
```

### Option 3: Separate Package

Publish as `simli-client-enhanced`:

```bash
npm publish simli-client-enhanced
```

## Important Commands

```bash
# Link SDK for development
cd ~/PROJECTS/simli-client && npm link
cd ~/PROJECTS/AILUNA/mvp-frontend && npm link simli-client

# Unlink when done
cd ~/PROJECTS/AILUNA/mvp-frontend
npm unlink simli-client
npm install  # Back to normal

# Build SDK
cd ~/PROJECTS/simli-client
npm run build

# Test SDK
cd ~/PROJECTS/simli-client
npm test
```

## Files Created

### In Your App (mvp-frontend)
- ✅ `src/lib/simli-wrapper/SimliClientWrapper.ts` - Enhanced wrapper
- ✅ `src/lib/simli-wrapper/index.ts` - Exports
- ✅ `src/lib/simli-wrapper/README.md` - Usage guide
- ✅ `docs/SIMLI_SDK_REFACTORING_PROPOSAL.md` - Architecture analysis
- ✅ `docs/SIMLI_SDK_IMPLEMENTATION_GUIDE.md` - Step-by-step guide
- ✅ `docs/SIMLI_QUICK_START.md` - This file

## Next Steps

1. **Today:** Start using wrapper in your app
2. **This week:** Fork repo and setup dev environment
3. **Next week:** Start building utilities
4. **Month 2-3:** Build core components
5. **Month 3:** Submit PRs or publish fork

## Questions?

- See detailed proposal: `docs/SIMLI_SDK_REFACTORING_PROPOSAL.md`
- See step-by-step guide: `docs/SIMLI_SDK_IMPLEMENTATION_GUIDE.md`
- See wrapper usage: `src/lib/simli-wrapper/README.md`

## Remember

- ❌ Never modify node_modules
- ✅ Always use npm link for local testing
- ✅ Write tests for everything
- ✅ Make small, incremental changes
- ✅ Communicate with maintainers
- ✅ Document everything

Good luck! 🚀
