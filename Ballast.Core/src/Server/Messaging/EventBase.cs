using System;

namespace Ballast.Core.Messaging
{
    public abstract class EventBase : IEvent 
    { 

        public abstract Guid Id { get; }
        
    }
}